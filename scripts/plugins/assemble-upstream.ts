/**
 * Release recipe for plugin bundles built from a pinned upstream GitHub commit, such as pstack
 * and gstack. The plugin directory workflow runs it for every `plugins/<name>/release/upstream.json`.
 * Run it locally after any change to `plugins/<name>/`:
 *
 *   node --import tsx/esm scripts/plugins/assemble-upstream.ts --plugin <name> --out <dir> \
 *     [--dry-run] [--cache <dir>] [--source <dir>] [--archive <file>]
 *
 * `--source` reads the plugin folder from another place than `plugins/<name>`. `--archive` reads
 * the upstream archive from a local file instead of GitHub. `--cache` keeps downloaded archives;
 * the default is `output/upstream-cache` in this checkout.
 *
 * The pins live in `plugins/<name>/release/upstream.json`. The `release/` folder is not part of
 * the package. Every field is required except `omit`:
 *
 *   {
 *     "repository": "owner/repo",
 *     "commit": "<40 hex>",
 *     "upstreamVersion": "0.15.36",
 *     "license": "MIT",
 *     "licenseFiles": ["pstack/LICENSE"],
 *     "skillsRoot": "pstack/skills",
 *     "skills": ["architect", "tdd"],
 *     "excluded": { "setup-pstack": "Configures other hosts. Farero role settings replace it." },
 *     "omit": { "pstack/skills/tdd/bin": "A program for a hook that Farero does not install." },
 *     "files": [{ "from": "pstack/agents/poteto-agent.md", "to": "skills/pstack-on-farero/agents/poteto-agent.md" }],
 *     "tree": { "files": 0, "sha256": "<64 hex>" }
 *   }
 *
 * - The archive is `https://codeload.github.com/<repository>/tar.gz/<commit>`.
 * - `plugin.json` must have the version `<upstreamVersion>-farero.<n>`.
 * - Upstream paths are relative to the repository root. `skillsRoot` is `.` for the root itself.
 * - `skills` are folders under `skillsRoot`, copied whole to `skills/<name>/`. Every other folder
 *   under `skillsRoot` must be in `excluded` with the reason it is left out.
 * - `omit` leaves files or folders inside a selected skill out of the copy, each with a reason.
 * - `files` copies other upstream files to a path in the package. `licenseFiles` go to
 *   `licenses/<path>`.
 * - `tree` is the count and closure digest of every copied upstream file, by upstream path, in
 *   the form `pluginClosureDigest` computes. When the commit or the selection changes, a run
 *   fails and prints the new tree. Review the changed upstream files before you copy it here.
 *
 * The recipe downloads the archive with the host's pinned HTTPS download and reads it with the
 * host's archive limits. It writes only the selected regular files, so a link elsewhere in the
 * repository is never written, and a link inside the selection refuses the run. It copies the
 * selected upstream files byte for byte and never edits them. It adds the license files,
 * THIRD_PARTY_NOTICES.md and PROVENANCE.json. Then the shared validator inspects the package.
 * Any validation error or warning fails the run, so a selected skill that validation would skip
 * fails it too. Without `--dry-run` the shared packer writes
 * `<out>/<name>-<version>.tgz` and the release receipt `<out>/<name>-<version>.release.json`.
 * With `--dry-run` the assembled folder stays in `<out>` and only the receipt is printed. Two
 * runs give the same archive bytes. Release archives are built on Linux or macOS, so the
 * executable modes are recorded.
 *
 * Publication of the archive or a directory entry is a separate, authorized release step. This
 * recipe only writes into `--out` and the cache.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
	chmodSync,
	copyFileSync,
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	type WriteStream,
	writeFileSync
} from 'node:fs'
import { mkdir, open } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { createGunzip } from 'node:zlib'
import { PLUGIN_NAME_PATTERN, type PluginFileEntry } from '@farero/core/plugin'
import { Parser, type ReadEntry } from 'tar'
import { pinnedHttpsDownload } from '../../src/host/plugins/fetch'
import { inspectPluginDirectory, pluginClosureDigest } from '../../src/host/plugins/inspect'
import { packPluginDirectory } from '../../src/host/plugins/pack'
import { PLUGIN_IGNORED_NAMES, PLUGIN_LIMITS, PluginPathSet, pluginPathProblem } from '../../src/host/plugins/paths'

interface UpstreamFile {
	from: string
	to: string
}

interface Pins {
	repository: string
	commit: string
	upstreamVersion: string
	license: string
	licenseFiles: string[]
	skillsRoot: string
	skills: string[]
	excluded: Record<string, string>
	omit: Record<string, string>
	files: UpstreamFile[]
	tree: { files: number; sha256: string }
}

const root = path.resolve(import.meta.dirname, '../..')
const RELEASE_FOLDER = 'release'
const GENERATED = ['THIRD_PARTY_NOTICES.md', 'PROVENANCE.json']
const FILE_TYPES = new Set(['File', 'OldFile', 'ContiguousFile'])
/** Headers, padding and the end-of-archive record on top of the admitted file bytes. */
const TAR_OVERHEAD_BYTES = 64 * 1024 * 1024
const PIN_FIELDS = new Set([
	'repository',
	'commit',
	'upstreamVersion',
	'license',
	'licenseFiles',
	'skillsRoot',
	'skills',
	'excluded',
	'omit',
	'files',
	'tree'
])

const { values } = parseArgs({
	options: {
		plugin: { type: 'string' },
		out: { type: 'string' },
		source: { type: 'string' },
		archive: { type: 'string' },
		cache: { type: 'string', default: path.join(root, 'output', 'upstream-cache') },
		'dry-run': { type: 'boolean', default: false }
	}
})

function fail(message: string): never {
	throw new Error(`assemble-upstream: ${message}`)
}

function step(message: string): void {
	process.stderr.write(`${message}\n`)
}

function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** Regular files under `directory` in code-unit order. Links and other entries refuse. */
function listFiles(directory: string, prefix = ''): string[] {
	const result: string[] = []
	const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0
	)
	for (const entry of entries) {
		if (PLUGIN_IGNORED_NAMES.has(entry.name)) continue
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name
		if (entry.isDirectory()) result.push(...listFiles(path.join(directory, entry.name), relative))
		else if (entry.isFile()) result.push(relative)
		else fail(`${relative} is not a regular file`)
	}
	return result
}

function readPins(file: string): Pins {
	const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
	const where = path.relative(process.cwd(), file)
	for (const key of Object.keys(raw)) if (!PIN_FIELDS.has(key)) fail(`${where} has an unknown field "${key}"`)
	const text = (key: string): string => {
		const value = raw[key]
		if (typeof value !== 'string' || !value.trim()) fail(`${where}: ${key} must be a non-empty string`)
		return value
	}
	const upstreamPath = (value: unknown, key: string): string => {
		if (typeof value !== 'string' || pluginPathProblem(value)) fail(`${where}: ${key} must be a relative portable path`)
		return value
	}
	const names = (key: string): string[] => {
		const value = raw[key]
		if (!Array.isArray(value)) fail(`${where}: ${key} must be a list`)
		const list = value.map((item, index) => upstreamPath(item, `${key}[${index}]`))
		if (new Set(list).size !== list.length) fail(`${where}: ${key} repeats an entry`)
		return list
	}
	const licenseFiles = names('licenseFiles')
	const repository = text('repository')
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail(`${where}: repository must be owner/repo`)
	const commit = text('commit')
	if (!/^[0-9a-f]{40}$/.test(commit)) fail(`${where}: commit must be a full 40-character commit id`)
	const excluded = raw.excluded
	if (!excluded || typeof excluded !== 'object' || Array.isArray(excluded)) fail(`${where}: excluded must be an object`)
	for (const [name, reason] of Object.entries(excluded))
		if (typeof reason !== 'string' || !reason.trim()) fail(`${where}: excluded skill ${name} needs a reason`)
	const omit = raw.omit ?? {}
	if (!omit || typeof omit !== 'object' || Array.isArray(omit)) fail(`${where}: omit must be an object`)
	for (const [file, reason] of Object.entries(omit)) {
		upstreamPath(file, `omit key ${file}`)
		if (typeof reason !== 'string' || !reason.trim()) fail(`${where}: omitted ${file} needs a reason`)
	}
	if (!Array.isArray(raw.files)) fail(`${where}: files must be a list`)
	const files = raw.files.map((item: unknown, index: number) => {
		const entry = item as Record<string, unknown> | null
		if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => key !== 'from' && key !== 'to'))
			fail(`${where}: files[${index}] must be { "from", "to" }`)
		return { from: upstreamPath(entry.from, `files[${index}].from`), to: upstreamPath(entry.to, `files[${index}].to`) }
	})
	const tree = raw.tree as Record<string, unknown> | null
	if (
		!tree ||
		typeof tree !== 'object' ||
		!Number.isSafeInteger(tree.files) ||
		typeof tree.sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(tree.sha256)
	)
		fail(`${where}: tree must be { "files": <count>, "sha256": "<64 hex>" }`)
	return {
		repository,
		commit,
		upstreamVersion: text('upstreamVersion'),
		license: text('license'),
		licenseFiles: licenseFiles.length ? licenseFiles : fail(`${where}: licenseFiles must name the upstream license`),
		skillsRoot: raw.skillsRoot === '.' ? '.' : upstreamPath(raw.skillsRoot, 'skillsRoot'),
		skills: names('skills'),
		excluded: excluded as Record<string, string>,
		omit: omit as Record<string, string>,
		files,
		tree: { files: tree.files as number, sha256: tree.sha256 }
	}
}

/** The pinned archive: a local file, a verified cached download, or a new download into the cache. */
async function upstreamArchive(pins: Pins): Promise<string> {
	if (values.archive) return path.resolve(values.archive)
	const file = path.join(
		path.resolve(values.cache as string),
		`${pins.repository.replace('/', '-')}-${pins.commit}.tar.gz`
	)
	const receipt = `${file}.sha256`
	if (existsSync(file) && existsSync(receipt) && readFileSync(receipt, 'utf8').trim() === sha256(readFileSync(file)))
		return file
	rmSync(receipt, { force: true })
	rmSync(file, { force: true })
	const url = `https://codeload.github.com/${pins.repository}/tar.gz/${pins.commit}`
	step(`Downloading ${url}...`)
	mkdirSync(path.dirname(file), { recursive: true })
	const partial = `${file}.${randomUUID()}.partial`
	try {
		const result = await pinnedHttpsDownload(url, partial, { redirects: 0 })
		renameSync(partial, file)
		writeFileSync(receipt, `${result.sha256}\n`)
		step(`Downloaded ${result.bytes} bytes.`)
		return file
	} finally {
		rmSync(partial, { force: true })
	}
}

interface Extracted {
	/** The selected files, at their upstream paths. */
	upstream: string
	/** Every upstream path in the archive with its tar entry type. */
	entries: Map<string, string>
	executables: Set<string>
}

/**
 * Extracts the selected regular files of one repository folder in a gzip or plain tar. The
 * host's archive limits bound the whole stream, and its path and size rules apply to the
 * selection. A link or other entry refuses inside the selection. Nothing else is written.
 */
async function extract(file: string, destination: string, selected: (name: string) => boolean): Promise<Extracted> {
	const entries = new Map<string, string>()
	const executables = new Set<string>()
	const paths = new PluginPathSet()
	const writes: Promise<void>[] = []
	const outputs = new Set<WriteStream>()
	const parser = new Parser({ strict: true, brotli: false, zstd: false })
	let top: string | undefined
	let count = 0
	let total = 0
	let failure: Error | undefined
	const refuse = (message: string) => {
		failure ??= new Error(`assemble-upstream: the upstream archive is refused: ${message}`)
		parser.abort(failure)
	}
	const done = new Promise<void>((resolve, reject) => {
		parser.on('abort', (error: Error) => reject(failure ?? error))
		parser.on('error', (error: Error) => refuse(error.message))
		parser.on('end', () => resolve())
	})
	const write = async (entry: ReadEntry, target: string): Promise<void> => {
		await mkdir(path.dirname(target), { recursive: true })
		if (failure) return
		const output = createWriteStream(target, { flags: 'wx' })
		outputs.add(output)
		try {
			await pipeline(entry, output)
		} finally {
			outputs.delete(output)
		}
	}
	/** Why the entry refuses the archive, or null when it is skipped or admitted. */
	const admission = (entry: ReadEntry, head: string, name: string): string | null => {
		if (++count > PLUGIN_LIMITS.files * 2) return 'it has too many entries'
		if (top !== undefined && head !== top) return 'it holds more than one repository folder'
		top = head
		if (!name || entry.type === 'Directory' || !selected(name)) return null
		if (!FILE_TYPES.has(entry.type)) return `${name}: ${entry.type} entries are not admitted`
		const problem = paths.add(name)
		if (problem) return `${name}: ${problem}`
		if (paths.size > PLUGIN_LIMITS.files) return 'the selection has too many files'
		if (entry.size > PLUGIN_LIMITS.fileBytes) return `${name}: the file is larger than 64 MiB`
		total += entry.size
		if (total > PLUGIN_LIMITS.bytes) return 'the selection is larger than 256 MiB'
		return null
	}
	parser.on('entry', (entry: ReadEntry) => {
		if (failure) return entry.resume()
		const [head, ...rest] = entry.path.replace(/\/+$/, '').split('/')
		const name = rest.join('/')
		if (name) entries.set(name, entry.type)
		const refusal = admission(entry, head, name)
		if (refusal) {
			entry.resume()
			return refuse(refusal)
		}
		if (!name || entry.type === 'Directory' || !selected(name)) return entry.resume()
		if (((entry.mode ?? 0) & 0o100) !== 0) executables.add(name)
		writes.push(write(entry, path.join(destination, ...name.split('/'))).catch((error: Error) => refuse(error.message)))
	})
	const magic = Buffer.alloc(2)
	const handle = await open(file, 'r')
	try {
		await handle.read(magic, 0, 2, 0)
	} finally {
		await handle.close()
	}
	const input = createReadStream(file)
	const tar = magic[0] === 0x1f && magic[1] === 0x8b ? input.pipe(createGunzip()) : input
	let compressed = 0
	let expanded = 0
	input.on('data', chunk => {
		compressed += chunk.length
	})
	tar.on('data', (chunk: Buffer) => {
		if (failure) return
		if (expanded === 0 && ((chunk[0] === 0x1f && chunk[1] === 0x8b) || chunk.readUInt32LE(0) === 0xfd2fb528))
			return refuse('only plain tar or a single gzip layer is admitted')
		expanded += chunk.length
		if (expanded > PLUGIN_LIMITS.bytes + TAR_OVERHEAD_BYTES) refuse('it expands beyond 256 MiB')
		else if (expanded > PLUGIN_LIMITS.ratioFloor && expanded > compressed * PLUGIN_LIMITS.ratio)
			refuse('it is compressed too far to admit')
	})
	input.on('error', error => refuse(error.message))
	if (tar !== input) tar.on('error', (error: Error) => refuse(error.message))
	tar.pipe(parser)
	try {
		await done
	} catch {
		input.destroy()
		tar.destroy()
		for (const output of outputs) output.destroy()
	}
	await Promise.all(writes)
	if (failure) throw failure
	return { upstream: destination, entries, executables }
}

function skillFolder(pins: Pins, skill: string): string {
	return pins.skillsRoot === '.' ? skill : `${pins.skillsRoot}/${skill}`
}

function notices(pins: Pins, authored: string[]): string {
	const ours = [
		...new Set(
			authored.map(file => {
				const segments = file.split('/')
				if (segments.length === 1) return `\`${file}\``
				return segments[0] === 'skills' && segments.length > 2 ? `\`skills/${segments[1]}/\`` : `\`${segments[0]}/\``
			})
		)
	]
	return [
		'# Third-party notices',
		'',
		`This package contains unmodified files from https://github.com/${pins.repository} at commit`,
		`${pins.commit} (upstream version ${pins.upstreamVersion}). They are licensed under ${pins.license}.`,
		'The upstream license texts are kept at these paths:',
		'',
		...pins.licenseFiles.map(file => `- \`licenses/${file}\``),
		'',
		'Upstream files in this package:',
		'',
		...pins.skills.map(skill => `- \`skills/${skill}/\` from \`${skillFolder(pins, skill)}/\``),
		...pins.files.map(file => `- \`${file.to}\` from \`${file.from}\``),
		'',
		'PROVENANCE.json lists the skills and the files that are left out, with the reason for each.',
		'',
		`The Farero files (${ours.join(', ')}) are MIT licensed.`,
		''
	].join('\n')
}

/** Validation drops these silently past their limit; a release bundle keeps everything it declares. */
function truncated(manifest: Record<string, unknown>, parsed: Record<string, Record<string, unknown>>): string[] {
	const extension = (manifest.extensions as Record<string, unknown> | undefined)?.['ai.farero'] as
		| Record<string, unknown>
		| undefined
	const problems: string[] = []
	for (const kind of ['commands', 'credentials', 'roles', 'workflows']) {
		const declared = Object.keys((extension?.[kind] as Record<string, unknown> | undefined) ?? {}).length
		const kept = Object.keys(parsed[kind] ?? {}).length
		if (declared > kept) problems.push(`only ${kept} of ${declared} ${kind} are kept`)
	}
	return problems
}

const name = values.plugin
if (!name || !PLUGIN_NAME_PATTERN.test(name)) fail('pass --plugin <name>')
if (!values.out) fail('pass --out <dir>')
const source = path.resolve(values.source ?? path.join(root, 'plugins', name))
const pins = readPins(path.join(source, RELEASE_FOLDER, 'upstream.json'))
const manifest = JSON.parse(readFileSync(path.join(source, 'plugin.json'), 'utf8')) as Record<string, unknown>
if (manifest.name !== name) fail(`${source}/plugin.json names ${String(manifest.name)}, not ${name}`)
const version = manifest.version
const versionPrefix = `${pins.upstreamVersion}-farero.`
if (
	typeof version !== 'string' ||
	!version.startsWith(versionPrefix) ||
	!/^\d+$/.test(version.slice(versionPrefix.length))
)
	fail(`plugin.json must have the version ${versionPrefix}<n>, not ${String(version)}`)
for (const skill of pins.skills) if (Object.hasOwn(pins.excluded, skill)) fail(`${skill} is both selected and excluded`)
if (process.platform === 'win32' && !values['dry-run'])
	fail('build release archives on Linux or macOS so executable modes are recorded; use --dry-run on Windows')
const outRoot = path.resolve(values.out)
const assembled = path.join(outRoot, `${name}-${version}`)
if (existsSync(assembled)) fail(`${assembled} already exists; remove it or choose another --out`)

const scratch = mkdtempSync(path.join(os.tmpdir(), `farero-${name}-upstream-`))
let finished = false
try {
	const omitted = Object.keys(pins.omit)
	const kept = (file: string) => !omitted.some(entry => file === entry || file.startsWith(`${entry}/`))
	const skillPrefixes = pins.skills.map(skill => `${skillFolder(pins, skill)}/`)
	const named = new Set([...pins.files.map(file => file.from), ...pins.licenseFiles])
	const { upstream, entries, executables } = await extract(
		await upstreamArchive(pins),
		path.join(scratch, 'upstream'),
		file => named.has(file) || (skillPrefixes.some(prefix => file.startsWith(prefix)) && kept(file))
	)

	const rootPrefix = pins.skillsRoot === '.' ? '' : `${pins.skillsRoot}/`
	if (
		rootPrefix &&
		entries.get(pins.skillsRoot) !== 'Directory' &&
		![...entries.keys()].some(file => file.startsWith(rootPrefix))
	)
		fail(`${pins.skillsRoot} is not a folder at ${pins.commit}`)
	const folders = new Set<string>()
	for (const [file, type] of entries) {
		if (!file.startsWith(rootPrefix)) continue
		const [child, ...deeper] = file.slice(rootPrefix.length).split('/')
		if (deeper.length || type === 'Directory') folders.add(child)
	}
	const unlisted = [...folders].filter(folder => !pins.skills.includes(folder) && !Object.hasOwn(pins.excluded, folder))
	if (unlisted.length)
		fail(`upstream skills ${unlisted.join(', ')} are neither selected nor excluded with a reason in upstream.json`)
	const missing = [...pins.skills, ...Object.keys(pins.excluded)].filter(skill => !folders.has(skill))
	if (missing.length) fail(`upstream.json names skills that ${pins.skillsRoot} does not have: ${missing.join(', ')}`)
	for (const entry of omitted) {
		if (!skillPrefixes.some(prefix => entry.startsWith(prefix)))
			fail(`omit names ${entry}, which is not inside a selected skill`)
		if (!entries.has(entry) && ![...entries.keys()].some(file => file.startsWith(`${entry}/`)))
			fail(`omit names ${entry}, which ${pins.commit} does not have`)
	}

	const copies: UpstreamFile[] = [
		...pins.skills.flatMap(skill => {
			const folder = path.join(upstream, ...skillFolder(pins, skill).split('/'))
			return (existsSync(folder) ? listFiles(folder) : []).map(file => ({
				from: `${skillFolder(pins, skill)}/${file}`,
				to: `skills/${skill}/${file}`
			}))
		}),
		...pins.files,
		...pins.licenseFiles.map(file => ({ from: file, to: `licenses/${file}` }))
	]
	const tree = new Map<string, PluginFileEntry>()
	for (const copy of copies) {
		if (tree.has(copy.from)) continue
		const file = path.join(upstream, ...copy.from.split('/'))
		if (!existsSync(file) || !statSync(file).isFile()) fail(`${copy.from} is not a file at ${pins.commit}`)
		const bytes = readFileSync(file)
		tree.set(copy.from, {
			path: copy.from,
			bytes: bytes.length,
			sha256: sha256(bytes),
			executable: executables.has(copy.from)
		})
	}
	const selected = { files: tree.size, sha256: pluginClosureDigest([...tree.values()]) }
	if (selected.files !== pins.tree.files || selected.sha256 !== pins.tree.sha256)
		fail(
			`the selected upstream files do not match the pinned tree digest. At ${pins.commit} the selection is ${JSON.stringify(selected)}. Review the changed upstream files before you pin this tree.`
		)

	const authored = listFiles(source).filter(file => file.split('/')[0] !== RELEASE_FOLDER)
	const paths = new PluginPathSet()
	const claim = (file: string, origin: string) => {
		const problem = paths.add(file)
		if (problem) fail(`${file} (${origin}): ${problem}`)
	}
	for (const file of authored) claim(file, `plugins/${name}`)
	for (const file of GENERATED) claim(file, 'generated')
	for (const copy of copies) claim(copy.to, copy.from)

	mkdirSync(assembled, { recursive: true })
	const place = (from: string, to: string, executable: boolean) => {
		const target = path.join(assembled, ...to.split('/'))
		mkdirSync(path.dirname(target), { recursive: true })
		copyFileSync(from, target)
		chmodSync(target, executable ? 0o755 : 0o644)
	}
	for (const file of authored) {
		const from = path.join(source, ...file.split('/'))
		place(from, file, (statSync(from).mode & 0o111) !== 0)
	}
	for (const copy of copies)
		place(path.join(upstream, ...copy.from.split('/')), copy.to, tree.get(copy.from)?.executable === true)
	writeFileSync(path.join(assembled, 'THIRD_PARTY_NOTICES.md'), notices(pins, authored))
	writeFileSync(
		path.join(assembled, 'PROVENANCE.json'),
		`${JSON.stringify(
			{
				plugin: { name, version },
				assembly: 'scripts/plugins/assemble-upstream.ts',
				upstream: {
					repository: pins.repository,
					commit: pins.commit,
					archive: `https://codeload.github.com/${pins.repository}/tar.gz/${pins.commit}`,
					version: pins.upstreamVersion,
					license: pins.license,
					licenseFiles: pins.licenseFiles.map(file => `licenses/${file}`),
					tree: selected
				},
				skills: pins.skills.map(skill => ({ name: skill, from: skillFolder(pins, skill), to: `skills/${skill}` })),
				excluded: pins.excluded,
				omitted: pins.omit,
				files: pins.files
			},
			null,
			'\t'
		)}\n`
	)

	const inspection = await inspectPluginDirectory(assembled)
	for (const item of inspection.diagnostics)
		step(`${item.severity} ${item.component}${item.path ? ` (${item.path})` : ''}: ${item.message}`)
	if (!inspection.ok) fail('the assembled package does not validate')
	const validated = new Set(inspection.manifest?.skills.map(skill => skill.name))
	const skipped = pins.skills.filter(skill => !validated.has(skill))
	if (skipped.length)
		fail(`validation skips selected upstream skills ${skipped.join(', ')}; exclude them with a reason`)
	if (inspection.diagnostics.length)
		fail('validation reported warnings; a release bundle keeps every value it declares')
	const dropped = truncated(manifest, (inspection.manifest?.extension ?? {}) as Record<string, Record<string, unknown>>)
	if (dropped.length) fail(`the package is past a manifest limit: ${dropped.join('; ')}`)

	const receipt: Record<string, unknown> = {
		ok: true,
		directory: assembled,
		name,
		version,
		digest: inspection.digest,
		files: inspection.files.length,
		bytes: inspection.bytes
	}
	if (!values['dry-run']) {
		const packed = await packPluginDirectory(assembled, path.join(outRoot, `${name}-${version}.tgz`))
		Object.assign(receipt, { archive: packed.archive, sha256: packed.sha256, archiveBytes: packed.bytes })
		writeFileSync(path.join(outRoot, `${name}-${version}.release.json`), `${JSON.stringify(receipt, null, '\t')}\n`)
	}
	process.stdout.write(`${JSON.stringify(receipt)}\n`)
	finished = true
} finally {
	rmSync(scratch, { recursive: true, force: true })
	// A failed run leaves no half-built package that would refuse the next run.
	if (!finished) rmSync(assembled, { recursive: true, force: true })
}
