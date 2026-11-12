import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Gives each plugin version in Farero's signed plugin directory a release in this repository:
 *
 *   node .github/scripts/releases.mjs [--dry-run]
 *
 * It reads the index at the URL in .github/farero.json, and refuses it unless a key in that file
 * signed it and it has not expired. For each listed version that has no release, it takes the
 * newest commit whose plugins/<id>/plugin.json has that version. It downloads the archive that
 * the index pins, checks its sha256, and checks that the archive holds every file of that folder
 * at that commit, byte for byte, except release/. Then it creates the release <id>-v<version> at
 * that commit with the archive and the signed index. It never changes a published release. A
 * draft that an interrupted run left is deleted and made again. --dry-run creates nothing.
 *
 * Needs git with the full history, gh with GH_TOKEN (contents: write) and tar. Node standard
 * library only.
 */

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const dryRun = process.argv.includes('--dry-run')
const config = JSON.parse(readFileSync(path.join('.github', 'farero.json'), 'utf8'))
const repository =
	process.env.GITHUB_REPOSITORY ??
	run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim()

function run(command, args, options = {}) {
	return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex')
}

class Refusal extends Error {}

function signedBy(payload, signature) {
	const key = config.directory.keys.find(candidate => candidate.id === signature?.keyId)
	if (!key || typeof signature.signature !== 'string') return false
	try {
		const publicKey = createPublicKey({
			key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(key.publicKey, 'base64')]),
			format: 'der',
			type: 'spki'
		})
		return verify(null, payload, publicKey, Buffer.from(signature.signature, 'base64'))
	} catch {
		return false
	}
}

async function signedIndex() {
	const response = await fetch(config.directory.url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
	if (!response.ok) throw new Refusal(`${config.directory.url} returned HTTP ${response.status}`)
	const text = await response.text()
	const document = JSON.parse(text)
	if (typeof document?.payload !== 'string' || !Array.isArray(document.signatures))
		throw new Refusal('the directory index is not a signed document')
	const payload = Buffer.from(document.payload, 'base64')
	if (!document.signatures.some(signature => signedBy(payload, signature)))
		throw new Refusal('no key in .github/farero.json signed the directory index')
	const index = JSON.parse(payload.toString('utf8'))
	if (index.version !== 1 || !Array.isArray(index.entries)) throw new Refusal('the directory index is not version 1')
	if (!(index.expiresAt > Date.now())) throw new Refusal('the directory index has expired')
	return { text, index }
}

/** Release tags, and the draft releases that an interrupted run left, by tag. */
function releases() {
	const lines = run('gh', [
		'api',
		'--paginate',
		`repos/${repository}/releases`,
		'--jq',
		'.[] | [.tag_name, (.draft | tostring), (.id | tostring)] | @tsv'
	])
	const published = new Set()
	const drafts = new Map()
	for (const line of lines.split('\n').filter(Boolean)) {
		const [tag, draft, id] = line.split('\t')
		if (draft === 'true') drafts.set(tag, id)
		else published.add(tag)
	}
	return { published, drafts }
}

function blob(commit, file) {
	return execFileSync('git', ['cat-file', 'blob', `${commit}:${file}`], {
		maxBuffer: 256 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore']
	})
}

/** The tagged commit, or else the newest commit whose plugin.json names the listed version. */
function sourceCommit(entry, tag) {
	try {
		return run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]).trim()
	} catch {}
	const manifest = `plugins/${entry.id}/plugin.json`
	for (const commit of run('git', ['rev-list', 'HEAD']).split('\n').filter(Boolean)) {
		let parsed
		try {
			parsed = JSON.parse(blob(commit, manifest).toString('utf8'))
		} catch {
			continue
		}
		if (parsed.name === entry.name && parsed.version === entry.version) return commit
	}
	throw new Refusal(`no commit has ${manifest} with ${entry.name} ${entry.version}`)
}

function recipe(commit, id) {
	const has = file => {
		try {
			execFileSync('git', ['cat-file', '-e', `${commit}:plugins/${id}/release/${file}`], { stdio: 'ignore' })
			return true
		} catch {
			return false
		}
	}
	return has('upstream.json') ? 'upstream' : has('sources.json') ? 'npm' : 'pack'
}

function packagedFiles(directory, prefix = '') {
	return readdirSync(directory).flatMap(name => {
		const absolute = path.join(directory, name)
		return statSync(absolute).isDirectory() ? packagedFiles(absolute, `${prefix}${name}/`) : [`${prefix}${name}`]
	})
}

/** Checks that the archive holds each file of the folder at the commit, byte for byte. */
function checkArchive(entry, commit, archive) {
	const extracted = mkdtempSync(path.join(os.tmpdir(), `${entry.id}-`))
	run('tar', ['-xzf', archive, '-C', extracted])
	const prefix = `plugins/${entry.id}/`
	const folder = run('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--', prefix])
		.split('\0')
		.filter(file => file && !file.startsWith(`${prefix}release/`))
	for (const file of folder) {
		const packaged = path.join(extracted, 'package', ...file.slice(prefix.length).split('/'))
		if (!existsSync(packaged)) throw new Refusal(`the archive has no ${file.slice(prefix.length)}`)
		if (!readFileSync(packaged).equals(blob(commit, file)))
			throw new Refusal(`${file.slice(prefix.length)} in the archive differs from ${file} at ${commit}`)
	}
	return { folder: folder.length, packaged: packagedFiles(path.join(extracted, 'package')).length }
}

function notes(entry, tag, archiveName, sequence, kind) {
	const folder = `plugins/${entry.id}/`
	const recipeText = {
		pack: `The check workflow packs \`${folder}\` with \`farero plugins pack\` and compares the result with this archive.`,
		upstream: `The upstream recipe adds the upstream files at the commit that \`${folder}release/upstream.json\` pins, their license texts, \`THIRD_PARTY_NOTICES.md\` and \`PROVENANCE.json\`.`,
		npm: `The npm recipe adds the npm packages that \`${folder}release/sources.json\` pins, their license texts, \`THIRD_PARTY_NOTICES.md\` and \`PROVENANCE.json\`.`
	}[kind]
	return [
		`Source: [\`${folder}\`](https://github.com/${repository}/tree/${tag}/${folder}) at this tag.`,
		'',
		'| Field | Value |',
		'| --- | --- |',
		`| Archive | \`${archiveName}\` |`,
		`| sha256 | \`${entry.source.sha256}\` |`,
		`| Closure digest | \`${entry.digest}\` |`,
		...(typeof entry.files === 'number' ? [`| Package | ${entry.files} files, ${entry.bytes} bytes |`] : []),
		...(entry.minAppVersion ? [`| Oldest Farero release | ${entry.minAppVersion} |`] : []),
		...(Array.isArray(entry.checks) ? [`| Checks | ${entry.checks.join(', ')} |`] : []),
		'',
		`Farero installs this archive from its signed plugin directory. Index sequence ${sequence} lists it, and \`directory-index.json\` is that signed index. Farero checks the sha256 and the closure digest before it installs the archive.`,
		'',
		`The archive holds every file of \`${folder}\` at this tag, byte for byte, except \`release/\`. ${recipeText}`,
		'',
		`To check a downloaded archive, run \`gh release verify-asset ${tag} ${archiveName}\`.`,
		''
	].join('\n')
}

/** Uploads one asset to a draft release and checks the digest that GitHub records. */
function upload(releaseId, file, name, type, label) {
	const query = new URLSearchParams({ name, ...(label ? { label } : {}) })
	const url = `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?${query}`
	const asset = JSON.parse(run('gh', ['api', '--method', 'POST', '-H', `Content-Type: ${type}`, '--input', file, url]))
	const expected = `sha256:${sha256(readFileSync(file))}`
	if (asset.digest && asset.digest !== expected)
		throw new Refusal(`GitHub recorded ${asset.digest} for ${name}, but the file is ${expected}`)
}

async function release(entry, text, sequence, existing) {
	const tag = `${entry.id}-v${entry.version}`
	if (existing.published.has(tag)) return { tag, state: 'published' }
	const commit = sourceCommit(entry, tag)
	const work = mkdtempSync(path.join(os.tmpdir(), `${tag}-`))
	const archiveName = path.posix.basename(new URL(entry.source.url).pathname)
	const archive = path.join(work, archiveName)
	const response = await fetch(entry.source.url, { signal: AbortSignal.timeout(600_000) })
	if (!response.ok) throw new Refusal(`${entry.source.url} returned HTTP ${response.status}`)
	const bytes = Buffer.from(await response.arrayBuffer())
	if (sha256(bytes) !== entry.source.sha256)
		throw new Refusal(`${entry.source.url} has sha256 ${sha256(bytes)}, but the index pins ${entry.source.sha256}`)
	writeFileSync(archive, bytes)
	const counts = checkArchive(entry, commit, archive)
	const kind = recipe(commit, entry.id)
	const notesFile = path.join(work, 'notes.md')
	writeFileSync(notesFile, notes(entry, tag, archiveName, sequence, kind))
	const indexFile = path.join(work, 'directory-index.json')
	writeFileSync(indexFile, text)
	const summary = { tag, commit, kind, ...counts }
	if (dryRun) return { ...summary, state: 'would create' }
	const draft = existing.drafts.get(tag)
	if (draft) run('gh', ['api', '--method', 'DELETE', `repos/${repository}/releases/${draft}`])
	// An immutable release refuses new assets once it is published, so the assets go to a draft first.
	const created = JSON.parse(
		run('gh', [
			'api',
			'--method',
			'POST',
			`repos/${repository}/releases`,
			'-f',
			`tag_name=${tag}`,
			'-f',
			`target_commitish=${commit}`,
			'-f',
			`name=${entry.displayName ?? entry.name} ${entry.version}`,
			'-F',
			`body=@${notesFile}`,
			'-F',
			'draft=true',
			'-f',
			'make_latest=false'
		])
	)
	upload(created.id, archive, archiveName, 'application/gzip')
	upload(created.id, indexFile, 'directory-index.json', 'application/json', 'Signed Farero plugin directory index')
	const published = JSON.parse(
		run('gh', [
			'api',
			'--method',
			'PATCH',
			`repos/${repository}/releases/${created.id}`,
			'-F',
			'draft=false',
			'-f',
			'make_latest=false'
		])
	)
	return { ...summary, state: 'created', immutable: published.immutable === true }
}

try {
	const { text, index } = await signedIndex()
	const existing = releases()
	const results = []
	const failures = []
	for (const entry of index.entries) {
		if (entry.withdrawn || !entry.version) {
			results.push({ id: entry.id, state: entry.withdrawn ? 'withdrawn' : 'no version' })
			continue
		}
		try {
			results.push(await release(entry, text, index.sequence, existing))
		} catch (error) {
			if (!(error instanceof Refusal)) throw error
			failures.push(`${entry.id} ${entry.version}: ${error.message}`)
		}
	}
	process.stdout.write(
		`${JSON.stringify({ ok: !failures.length, dryRun, sequence: index.sequence, results, failures })}\n`
	)
	if (failures.length) process.exit(1)
} catch (error) {
	if (!(error instanceof Refusal)) throw error
	process.stderr.write(`releases: ${error.message}\n`)
	process.exit(1)
}
