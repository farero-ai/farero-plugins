/**
 * Release recipe for the Farero jevgrep adapter package. Run it in release CI (Linux) for every
 * adapter release, and after any change to `plugins/jevgrep/`:
 *
 *   node --import tsx/esm scripts/plugins/assemble-jevgrep.ts [--out output/plugins] [--dry-run]
 *
 * It assembles one complete, immutable plugin directory from the pinned npm release archives in
 * `plugins/jevgrep/release/sources.json` and never rebuilds upstream source:
 *
 * 1. npm installs exactly the pinned closure into a scratch project with a generated lockfile
 *    (`npm ci --ignore-scripts`), so npm's maintained extractor verifies each archive against
 *    its pinned sha512 integrity and no package lifecycle script runs.
 * 2. Each package's registry signature is checked against the pinned npm signing key, and the
 *    registry must still report the pinned integrity.
 * 3. `npm audit signatures` verifies every registry signature and Sigstore attestation. This
 *    recipe then requires the SLSA provenance of each package that publishes one to name the
 *    pinned repository, workflow, ref and commit, and its subject to match the pinned digest.
 *    A missing expected attestation fails the release; it never downgrades to integrity only.
 * 4. The adapter source, the vendored closure in `vendor/node_modules`, every license file,
 *    THIRD_PARTY_NOTICES.md and PROVENANCE.json form the package. The file set of each vendored
 *    package must equal its pinned list, and no vendored package may need an install script.
 * 5. The shared validator inspects the directory and the shared packer writes the archive and
 *    a release receipt. `--dry-run` stops after validation and writes no archive. It also
 *    supports Windows for the development seed; release archives are built on Linux or
 *    macOS, where executable modes are available to the closure verifier.
 *
 * Needs network access to registry.npmjs.org. Publication of the archive or a directory entry
 * is a separate, authorized release step; this recipe only writes into `--out`.
 */
import { execFileSync } from 'node:child_process'
import { createPublicKey, verify, X509Certificate } from 'node:crypto'
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { inspectPluginDirectory } from '../../src/host/plugins/inspect'
import { packPluginDirectory } from '../../src/host/plugins/pack'

interface PinnedProvenance {
	repository: string
	workflow: string
	ref: string
	commit: string
}

interface PinnedPackage {
	name: string
	version: string
	tarball: string
	integrity: string
	sha256: string
	dependencies: Record<string, string>
	bin?: Record<string, string>
	license: string
	licenseFiles: string[]
	provenance: PinnedProvenance | null
	files: string[]
}

interface Sources {
	adapter: { name: string; version: string }
	registry: string
	registryKey: { keyid: string; keytype: string; key: string }
	packages: PinnedPackage[]
}

const root = path.resolve(import.meta.dirname, '../..')
const adapterSource = path.join(root, 'plugins', 'jevgrep')
const ADAPTER_FILES = ['plugin.json', 'README.md', 'ai.farero', 'roles', 'skills']
const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1'

const { values } = parseArgs({
	options: {
		out: { type: 'string', default: path.join(root, 'output', 'plugins') },
		'dry-run': { type: 'boolean', default: false }
	}
})

function fail(message: string): never {
	throw new Error(`assemble-jevgrep: ${message}`)
}

function step(message: string): void {
	process.stderr.write(`${message}\n`)
}

function integrityHex(integrity: string): string {
	if (!integrity.startsWith('sha512-')) fail(`unsupported integrity ${integrity}`)
	return Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')
}

function registryPath(name: string): string {
	return name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)
}

async function fetchJson(url: string): Promise<unknown> {
	const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
	if (!response.ok) fail(`${url} returned HTTP ${response.status}`)
	return response.json()
}

function npm(args: string[], cwd: string): string {
	// Windows cannot exec npm.cmd directly. Invoke npm's JS entry with this Node instead
	// of passing package-manager arguments through a shell. Standard Node/npm installs
	// keep that entry beside the npm shim; searching PATH preserves the user's toolchain.
	let executable = 'npm'
	let arguments_ = args
	if (process.platform === 'win32') {
		const directories = [path.dirname(process.execPath), ...(process.env.PATH ?? '').split(path.delimiter)]
		const cli = directories
			.filter(Boolean)
			.map(directory => path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'))
			.find(file => existsSync(file) && statSync(file).isFile())
		if (!cli) fail('npm is unavailable; install Node with npm before assembling the development example')
		executable = process.execPath
		arguments_ = [cli, ...args]
	}
	return execFileSync(executable, arguments_, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 180_000,
		windowsHide: true,
		env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_fund: 'false', npm_config_audit: 'false' }
	})
}

function listFiles(directory: string, prefix = ''): string[] {
	const result: string[] = []
	for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name
		if (entry.isDirectory()) result.push(...listFiles(path.join(directory, entry.name), relative))
		else if (entry.isFile()) result.push(relative)
		else fail(`unexpected non-file entry ${relative}`)
	}
	return result
}

function copyTree(from: string, to: string, files: string[]): void {
	for (const file of files) {
		const source = path.join(from, ...file.split('/'))
		const target = path.join(to, ...file.split('/'))
		mkdirSync(path.dirname(target), { recursive: true })
		copyFileSync(source, target)
		chmodSync(target, statSync(source).mode & 0o111 ? 0o755 : 0o644)
	}
}

/** Generated lockfile pinning every resolved URL and integrity; npm ci refuses any mismatch. */
function scratchProject(sources: Sources, directory: string): void {
	const top = sources.packages[0]
	writeFileSync(
		path.join(directory, 'package.json'),
		`${JSON.stringify({ name: 'farero-jevgrep-closure', private: true, dependencies: { [top.name]: top.version } }, null, 2)}\n`
	)
	const packages: Record<string, unknown> = {
		'': { name: 'farero-jevgrep-closure', dependencies: { [top.name]: top.version } }
	}
	for (const item of sources.packages)
		packages[`node_modules/${item.name}`] = {
			version: item.version,
			resolved: item.tarball,
			integrity: item.integrity,
			license: item.license,
			...(Object.keys(item.dependencies).length ? { dependencies: item.dependencies } : {}),
			...(item.bin ? { bin: item.bin } : {})
		}
	writeFileSync(
		path.join(directory, 'package-lock.json'),
		`${JSON.stringify({ name: 'farero-jevgrep-closure', lockfileVersion: 3, requires: true, packages }, null, 2)}\n`
	)
}

async function checkRegistrySignature(sources: Sources, item: PinnedPackage): Promise<string> {
	const document = (await fetchJson(`${sources.registry}/${registryPath(item.name)}/${item.version}`)) as {
		dist?: { integrity?: string; signatures?: { keyid: string; sig: string }[] }
	}
	if (document.dist?.integrity !== item.integrity)
		fail(`${item.name}@${item.version} no longer has the pinned integrity`)
	const key = createPublicKey({ key: Buffer.from(sources.registryKey.key, 'base64'), format: 'der', type: 'spki' })
	const message = Buffer.from(`${item.name}@${item.version}:${item.integrity}`)
	const valid = (document.dist.signatures ?? []).some(
		signature =>
			signature.keyid === sources.registryKey.keyid &&
			verify('sha256', message, key, Buffer.from(signature.sig, 'base64'))
	)
	if (!valid) fail(`${item.name}@${item.version} has no valid registry signature from ${sources.registryKey.keyid}`)
	return sources.registryKey.keyid
}

interface AttestationBundle {
	predicateType: string
	bundle: {
		dsseEnvelope: { payload: string; payloadType: string }
		verificationMaterial: {
			x509CertificateChain?: { certificates: { rawBytes: string }[] }
			certificate?: { rawBytes: string }
		}
	}
}

async function checkProvenance(sources: Sources, item: PinnedPackage): Promise<PinnedProvenance | null> {
	const url = `${sources.registry}/-/npm/v1/attestations/${registryPath(item.name)}@${item.version}`
	const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
	if (response.status === 404) {
		if (item.provenance) fail(`${item.name}@${item.version} is missing its expected provenance attestation`)
		return null
	}
	if (!response.ok) fail(`${url} returned HTTP ${response.status}`)
	const { attestations } = (await response.json()) as { attestations: AttestationBundle[] }
	const provenance = attestations.find(item => item.predicateType === SLSA_PROVENANCE)
	if (!item.provenance) {
		if (provenance) step(`${item.name}@${item.version} now publishes provenance; the pinned sources do not require it.`)
		return null
	}
	if (!provenance) fail(`${item.name}@${item.version} has no SLSA provenance attestation`)
	if (provenance.bundle.dsseEnvelope.payloadType !== 'application/vnd.in-toto+json')
		fail(`${item.name} provenance is not an in-toto statement`)
	const statement = JSON.parse(Buffer.from(provenance.bundle.dsseEnvelope.payload, 'base64').toString('utf8')) as {
		subject: { name: string; digest: { sha512?: string } }[]
		predicate: {
			buildDefinition: {
				externalParameters: { workflow: { repository: string; path: string; ref: string } }
				resolvedDependencies: { uri: string; digest: { gitCommit?: string } }[]
			}
		}
	}
	if (!statement.subject.some(subject => subject.digest.sha512 === integrityHex(item.integrity)))
		fail(`${item.name} provenance subject does not match the pinned archive`)
	const workflow = statement.predicate.buildDefinition.externalParameters.workflow
	const commit = statement.predicate.buildDefinition.resolvedDependencies.find(entry => entry.digest.gitCommit)?.digest
		.gitCommit
	const expected = item.provenance
	if (
		workflow.repository !== expected.repository ||
		workflow.path !== expected.workflow ||
		workflow.ref !== expected.ref ||
		commit !== expected.commit
	)
		fail(`${item.name} provenance names ${workflow.repository} ${workflow.path} ${workflow.ref} ${commit}`)
	const material = provenance.bundle.verificationMaterial
	const raw = material.x509CertificateChain?.certificates[0]?.rawBytes ?? material.certificate?.rawBytes
	if (!raw) fail(`${item.name} provenance has no signing certificate`)
	const identity = `URI:${expected.repository}/${expected.workflow}@${expected.ref}`
	const certificate = new X509Certificate(Buffer.from(raw, 'base64'))
	if (!(certificate.subjectAltName ?? '').split(', ').includes(identity))
		fail(`${item.name} provenance certificate is not issued to ${identity}`)
	return expected
}

/** npm verifies each signature and Sigstore bundle; this requires the counts the pins expect. */
function auditSignatures(sources: Sources, scratch: string): { registrySignatures: number; attestations: number } {
	const output = npm(['audit', 'signatures'], scratch)
	const registrySignatures = sources.packages.length
	const attestations = sources.packages.filter(item => item.provenance).length
	const plural = (count: number) => (count === 1 ? 'package has' : 'packages have')
	for (const line of [
		`${registrySignatures} ${plural(registrySignatures)} verified registry signature${registrySignatures === 1 ? '' : 's'}`,
		`${attestations} ${plural(attestations)} verified attestation${attestations === 1 ? '' : 's'}`
	])
		if (!output.includes(line)) fail(`npm audit signatures did not report "${line}":\n${output}`)
	return { registrySignatures, attestations }
}

function notices(sources: Sources): string {
	const rows = sources.packages.map(
		item =>
			`| ${item.name} | ${item.version} | ${item.license} | ${item.licenseFiles.map(file => `\`vendor/node_modules/${item.name}/${file}\``).join(', ')} |`
	)
	return [
		'# Third-party notices',
		'',
		'This package contains these unmodified npm release archives. Their license texts and notices',
		'are kept at the listed paths.',
		'',
		'| Package | Version | License | License files |',
		'| --- | --- | --- | --- |',
		...rows,
		'',
		'The Farero adapter files (`plugin.json`, `README.md`, `ai.farero/`, `roles/` and `skills/`) are MIT licensed.',
		''
	].join('\n')
}

const sources = JSON.parse(readFileSync(path.join(adapterSource, 'release', 'sources.json'), 'utf8')) as Sources
const manifest = JSON.parse(readFileSync(path.join(adapterSource, 'plugin.json'), 'utf8')) as { version: string }
if (manifest.version !== sources.adapter.version) fail('plugin.json and release/sources.json name different versions')
if (process.platform === 'win32' && !values['dry-run'])
	fail(
		'build release archives on Linux or macOS so executable modes are recorded; use --dry-run for a local Windows package'
	)
const outRoot = path.resolve(values.out as string)
const assembled = path.join(outRoot, `${sources.adapter.name}-${sources.adapter.version}`)
if (existsSync(assembled)) fail(`${assembled} already exists; remove it or choose another --out`)

const scratch = mkdtempSync(path.join(os.tmpdir(), 'farero-jevgrep-closure-'))
try {
	step('Installing the pinned closure with npm ci --ignore-scripts...')
	scratchProject(sources, scratch)
	npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--no-bin-links'], scratch)

	const evidence: Record<string, unknown>[] = []
	for (const item of sources.packages) {
		const directory = path.join(scratch, 'node_modules', ...item.name.split('/'))
		const installed = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
			version: string
			scripts?: Record<string, string>
		}
		if (installed.version !== item.version) fail(`${item.name} installed ${installed.version}, not ${item.version}`)
		for (const hook of ['preinstall', 'install', 'postinstall'])
			if (installed.scripts?.[hook]) fail(`${item.name} declares a ${hook} script; the closure must not need one`)
		const files = listFiles(directory).sort((a, b) => a.localeCompare(b))
		const expected = [...item.files].sort((a, b) => a.localeCompare(b))
		if (JSON.stringify(files) !== JSON.stringify(expected))
			fail(`${item.name} file set differs from the pinned list:\n${files.join('\n')}`)
		for (const license of item.licenseFiles) if (!files.includes(license)) fail(`${item.name} is missing ${license}`)
		step(`Checking ${item.name}@${item.version} registry signature and provenance...`)
		const keyid = await checkRegistrySignature(sources, item)
		const provenance = await checkProvenance(sources, item)
		evidence.push({
			name: item.name,
			version: item.version,
			tarball: item.tarball,
			integrity: item.integrity,
			sha256: item.sha256,
			license: item.license,
			licenseFiles: item.licenseFiles.map(file => `vendor/node_modules/${item.name}/${file}`),
			registrySignature: { keyid, verified: true },
			provenance: provenance
				? { verified: true, verifier: 'npm audit signatures + pinned identity', ...provenance }
				: { published: false }
		})
	}
	step('Running npm audit signatures...')
	const audit = auditSignatures(sources, scratch)

	mkdirSync(assembled, { recursive: true })
	for (const entry of ADAPTER_FILES) {
		const source = path.join(adapterSource, entry)
		if (statSync(source).isDirectory()) copyTree(source, path.join(assembled, entry), listFiles(source))
		else copyTree(adapterSource, assembled, [entry])
	}
	for (const item of sources.packages) {
		const from = path.join(scratch, 'node_modules', ...item.name.split('/'))
		copyTree(from, path.join(assembled, 'vendor', 'node_modules', ...item.name.split('/')), item.files)
	}
	writeFileSync(path.join(assembled, 'THIRD_PARTY_NOTICES.md'), notices(sources))
	writeFileSync(
		path.join(assembled, 'PROVENANCE.json'),
		`${JSON.stringify(
			{
				adapter: sources.adapter,
				assembly: 'scripts/plugins/assemble-jevgrep.ts',
				lifecycleScripts: 'not run (npm ci --ignore-scripts); no vendored package declares an install script',
				registryKey: sources.registryKey.keyid,
				npmAuditSignatures: { verified: true, ...audit },
				components: evidence
			},
			null,
			'\t'
		)}\n`
	)

	const inspection = await inspectPluginDirectory(assembled)
	for (const item of inspection.diagnostics) step(`${item.severity} ${item.component}: ${item.message}`)
	if (!inspection.ok) fail('the assembled package does not validate')
	const receipt: Record<string, unknown> = {
		ok: true,
		directory: assembled,
		name: sources.adapter.name,
		version: sources.adapter.version,
		digest: inspection.digest,
		files: inspection.files.length,
		bytes: inspection.bytes
	}
	if (!values['dry-run']) {
		const packed = await packPluginDirectory(
			assembled,
			path.join(outRoot, `${sources.adapter.name}-${sources.adapter.version}.tgz`)
		)
		Object.assign(receipt, { archive: packed.archive, sha256: packed.sha256, archiveBytes: packed.bytes })
		writeFileSync(
			path.join(outRoot, `${sources.adapter.name}-${sources.adapter.version}.release.json`),
			`${JSON.stringify(receipt, null, '\t')}\n`
		)
	}
	process.stdout.write(`${JSON.stringify(receipt)}\n`)
} finally {
	rmSync(scratch, { recursive: true, force: true })
}
