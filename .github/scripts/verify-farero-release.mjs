import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * Verifies a downloaded Farero release before a plugin author's CI installs it:
 *
 *   node verify-farero-release.mjs <manifest.json> <farero-x.y.z.tgz> <x.y.z>
 *
 * The manifest is the signed envelope from https://updates.farero.ai/downloads/v<x.y.z>/. Its
 * Ed25519 signature must verify with Farero's release key, it must name the requested version,
 * and the app archive must match the manifest's sha256 and size. Node standard library only.
 */

const RELEASE_PUBLIC_KEY =
	'-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAmTn2KRdm0FZpkzLTYQQ184WQVPalVsaLFmv/Z+FrlHs=\n-----END PUBLIC KEY-----\n'

function fail(message) {
	process.stderr.write(`${message}\n`)
	process.exit(1)
}

const [manifestFile, archiveFile, version] = process.argv.slice(2)
if (!manifestFile || !archiveFile || !/^\d+\.\d+\.\d+$/.test(version ?? ''))
	fail('Usage: node verify-farero-release.mjs <manifest.json> <farero-x.y.z.tgz> <x.y.z>')
const envelope = JSON.parse(readFileSync(manifestFile, 'utf8'))
if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string')
	fail('Not a signed release manifest.')
const payload = Buffer.from(envelope.payload, 'base64')
if (!verify(null, payload, createPublicKey(RELEASE_PUBLIC_KEY), Buffer.from(envelope.signature, 'base64')))
	fail('The release signature does not verify.')
const release = JSON.parse(payload.toString('utf8'))
if (release.version !== version) fail(`The manifest is for ${release.version}, not ${version}.`)
const app = release.app ?? release
if (app.artifact !== `farero-${version}.tgz`) fail('The manifest does not describe the app archive.')
const archive = readFileSync(archiveFile)
if (archive.length !== app.size || createHash('sha256').update(archive).digest('hex') !== app.sha256)
	fail('The app archive does not match the signed manifest.')
process.stdout.write(`Verified Farero ${version} (${app.sha256}).\n`)
