import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Reads Farero's signed plugin directory for the sync and release scripts. The index must be
 * signed by a key in .github/farero.json and must not have expired. Node standard library only.
 */

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export const config = JSON.parse(readFileSync(path.join('.github', 'farero.json'), 'utf8'))

/** A reason to stop that this repository's state or Farero's directory explains. */
export class Refusal extends Error {}

export function run(command, args, options = {}) {
	return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
}

export function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex')
}

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

/** The verified index payload, and the signed document's text as Farero serves it. */
export async function signedIndex() {
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

/** Downloads a file that the index pins and checks its sha256. */
export async function pinned(url, expected, timeout = 600_000) {
	const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
	if (!response.ok) throw new Refusal(`${url} returned HTTP ${response.status}`)
	const bytes = Buffer.from(await response.arrayBuffer())
	if (sha256(bytes) !== expected)
		throw new Refusal(`${url} has sha256 ${sha256(bytes)}, but the index pins ${expected}`)
	return bytes
}

/** Runs a script body and turns a refusal into a one-line error and exit code 1. */
export async function main(body) {
	try {
		await body()
	} catch (error) {
		if (!(error instanceof Refusal)) throw error
		process.stderr.write(`${path.basename(process.argv[1])}: ${error.message}\n`)
		process.exit(1)
	}
}
