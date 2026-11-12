import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Farero adapter for the pinned jevgrep 0.8.5 CLI. It exposes two operations, `search` and
 * `files`, and enforces bounds that the CLI itself does not offer:
 *
 * - Upload: every provider request body is metered at the fetch boundary. A request that would
 *   pass the upload budget is refused and the search stops with its partial result.
 *   `--max-source-bytes` is different: it only limits the excerpts printed in the result.
 * - Requests: jevgrep's own `--max-requests`, plus the same ceiling at the fetch boundary.
 * - Destination: requests go only to the configured provider's origin, without redirects.
 * - Time: the search stops at the time limit and prints what it found.
 * - Concurrency: fixed at four requests in flight.
 *
 * The API key arrives once on stdin as Farero's private envelope. It is written only by the
 * CLI's own `auth --stdin` into a per-invocation private config directory that Farero owns and
 * removes after the process group ends. The key never appears in argv, the environment or
 * output, and the user's global jevgrep configuration is never read or changed.
 *
 * Exit codes: 0 complete or bounded partial, 1 failed, 2 incomplete with an operational issue
 * (all from jevgrep); 3 stopped at an adapter budget with partial output; 64 invalid adapter
 * input; 65 the key was refused before any request; 70 the package is incomplete; 130 stopped
 * by Farero.
 */

const EXIT = { budget: 3, usage: 64, credential: 65, incomplete: 70 }
const PROVIDER_ORIGINS = {
	typesafe: 'https://api.typesafe.ai',
	vercel: 'https://ai-gateway.vercel.sh',
	openrouter: 'https://openrouter.ai',
	opencode: 'https://opencode.ai'
}
const CONCURRENCY = 4
/** Below the command's 256 KiB stdout limit, so jevgrep truncates with its own marker first. */
const MAX_OUTPUT_BYTES = 250_000
const STOP_GRACE_MS = 20_000
const FILES_TIME_LIMIT_MS = 100_000
const ENVELOPE_LIMIT = 32 * 1024

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const cli = path.join(packageRoot, 'vendor', 'node_modules', '@dzhng', 'jevgrep', 'dist', 'bin', 'index.js')

class AdapterError extends Error {
	constructor(code, message) {
		super(message)
		this.code = code
	}
}

/**
 * Farero passes each declared binding as one literal element after its `--name` literal, so a
 * value is taken verbatim even when it is empty or starts with a dash.
 */
function pairs(args, names) {
	if (args.length % 2) throw new AdapterError(EXIT.usage, 'Arguments must be --name value pairs.')
	const values = {}
	for (let index = 0; index < args.length; index += 2) {
		const name = args[index].startsWith('--') ? args[index].slice(2) : ''
		if (!names.includes(name) || Object.hasOwn(values, name))
			throw new AdapterError(EXIT.usage, `Unexpected argument ${args[index]}.`)
		values[name] = args[index + 1]
	}
	return values
}

function integer(raw, name, minimum, maximum) {
	if (raw === undefined || !/^\d+$/.test(raw)) throw new AdapterError(EXIT.usage, `${name} must be a whole number.`)
	const value = Number(raw)
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
		throw new AdapterError(EXIT.usage, `${name} must be from ${minimum} to ${maximum}.`)
	return value
}

/** Resolves the requested folder and refuses anything outside the worktree, including through links. */
function searchRoot(relative) {
	if (typeof relative !== 'string' || path.isAbsolute(relative))
		throw new AdapterError(EXIT.usage, 'path must be relative to the worktree root.')
	const workspace = realpathSync(process.cwd())
	let root
	try {
		root = realpathSync(path.resolve(workspace, relative))
	} catch {
		throw new AdapterError(EXIT.usage, `The folder ${relative} does not exist in the worktree.`)
	}
	const inside = path.relative(workspace, root)
	if (inside.startsWith('..') || path.isAbsolute(inside))
		throw new AdapterError(EXIT.usage, 'path must stay inside the worktree.')
	if (!statSync(root).isDirectory()) throw new AdapterError(EXIT.usage, `${relative} is not a folder.`)
	return root
}

function privateDirectory(name) {
	const value = process.env[name]
	if (!value || !path.isAbsolute(value))
		throw new AdapterError(
			EXIT.usage,
			`Farero did not provide ${name}. This adapter runs only as a managed Farero command; it never uses your global jevgrep setup.`
		)
	return value
}

async function readEnvelope() {
	const chunks = []
	let size = 0
	for await (const chunk of process.stdin) {
		size += chunk.length
		if (size > ENVELOPE_LIMIT) throw new AdapterError(EXIT.usage, 'The private input is larger than expected.')
		chunks.push(chunk)
	}
	let envelope
	try {
		envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		throw new AdapterError(EXIT.usage, 'The private input is not the expected Farero envelope.')
	}
	const key = envelope?.version === 1 ? envelope.credentials?.apiKey : undefined
	if (typeof key !== 'string' || !key)
		throw new AdapterError(EXIT.credential, 'No API key was provided. Add the key in Settings, Plugins, Jevgrep.')
	return key
}

/** Only what the CLI needs to locate its own files; nothing from the caller's environment. */
function childEnvironment(configHome, cacheHome) {
	const keep = ['PATH', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG']
	const env = {}
	for (const name of keep) if (process.env[name] !== undefined) env[name] = process.env[name]
	env.XDG_CONFIG_HOME = configHome
	env.XDG_CACHE_HOME = cacheHome
	return env
}

function authenticate(provider, key, configHome, cacheHome) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cli, 'auth', '--provider', provider, '--stdin'], {
			env: childEnvironment(configHome, cacheHome),
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: false,
			windowsHide: true
		})
		let message = ''
		const collect = chunk => {
			if (message.length < 2000) message += chunk
		}
		child.stdout.setEncoding('utf8').on('data', collect)
		child.stderr.setEncoding('utf8').on('data', collect)
		child.once('error', error =>
			reject(new AdapterError(EXIT.incomplete, `The pinned CLI could not start (${error.code}).`))
		)
		child.once('close', code => {
			if (code === 0) resolve()
			else
				reject(
					new AdapterError(
						EXIT.credential,
						`The saved key was refused before any provider request: ${message.split(key).join('[key]').trim() || `exit ${code}`}`
					)
				)
		})
		child.stdin.on('error', () => undefined)
		child.stdin.end(key)
	})
}

async function bodyBytes(body) {
	if (body === undefined || body === null) return 0
	if (typeof body === 'string') return Buffer.byteLength(body)
	if (body instanceof ArrayBuffer) return body.byteLength
	if (ArrayBuffer.isView(body)) return body.byteLength
	if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size
	if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString())
	return undefined
}

/**
 * Replaces fetch before the CLI loads. Each request is checked against the destination, the
 * request ceiling and the upload budget before it is sent; a refused request never leaves the
 * process. `onLimit` stops the search so its partial result is printed.
 */
function installMeter({ origin, maxRequests, maxBytes, onLimit }) {
	const original = globalThis.fetch
	const totals = { requests: 0, bytes: 0, refused: 0 }
	globalThis.fetch = async (input, init = {}) => {
		const request = input instanceof Request ? input : undefined
		const url = new URL(request ? request.url : String(input))
		if (url.origin !== origin) {
			totals.refused++
			throw new TypeError(`Refused a request to ${url.origin}; this plugin sends data only to ${origin}.`)
		}
		const body = init.body !== undefined ? init.body : request ? await request.clone().arrayBuffer() : undefined
		const bytes = await bodyBytes(body)
		if (bytes === undefined) {
			totals.refused++
			throw new TypeError('Refused a request whose size cannot be measured before it is sent.')
		}
		if (totals.requests + 1 > maxRequests) {
			totals.refused++
			onLimit('request')
			throw new TypeError('The request budget is used up.')
		}
		if (totals.bytes + bytes > maxBytes) {
			totals.refused++
			onLimit('upload')
			throw new TypeError('The upload budget is used up.')
		}
		totals.requests++
		totals.bytes += bytes
		return original(input, { ...init, redirect: 'error' })
	}
	return totals
}

/** Runs the pinned CLI in this process so the meter sees every request it makes. */
async function runCli(args) {
	process.argv = [process.execPath, cli, ...args]
	await import(pathToFileURL(cli).href)
}

async function search(values) {
	const provider = values.provider
	if (!Object.hasOwn(PROVIDER_ORIGINS, provider))
		throw new AdapterError(EXIT.usage, `provider must be one of ${Object.keys(PROVIDER_ORIGINS).join(', ')}.`)
	const maxRequests = integer(values['max-requests'], 'maxRequests', 1, 1000)
	const maxUploadMiB = integer(values['max-upload-mib'], 'maxUploadMiB', 1, 64)
	const timeLimit = integer(values['time-limit'], 'timeLimitSeconds', 10, 600)
	const maxSourceBytes = integer(values['max-source-bytes'], 'maxSourceBytes', 1000, 200_000)
	const question = values.question ?? ''
	if (!question.trim()) throw new AdapterError(EXIT.usage, 'question must not be empty.')
	const root = searchRoot(values.path ?? '.')
	const configHome = path.join(privateDirectory('FARERO_PLUGIN_PRIVATE_DIR'), 'jevgrep-config')
	const cacheHome = privateDirectory('FARERO_PLUGIN_CACHE_DIR')
	const key = await readEnvelope()
	mkdirSync(configHome, { recursive: true, mode: 0o700 })
	mkdirSync(cacheHome, { recursive: true, mode: 0o700 })
	process.on('exit', () => rmSync(configHome, { recursive: true, force: true }))
	await authenticate(provider, key, configHome, cacheHome)

	process.env.XDG_CONFIG_HOME = configHome
	process.env.XDG_CACHE_HOME = cacheHome
	let stoppedBy
	const stop = reason => {
		if (stoppedBy) return
		stoppedBy = reason
		process.emit('SIGINT')
		setTimeout(() => {
			process.stderr.write(`Jevgrep did not stop within ${STOP_GRACE_MS / 1000} s after the ${reason} limit.\n`)
			process.exit(EXIT.budget)
		}, STOP_GRACE_MS).unref()
	}
	const totals = installMeter({
		origin: PROVIDER_ORIGINS[provider],
		maxRequests,
		maxBytes: maxUploadMiB * 1024 * 1024,
		onLimit: stop
	})
	setTimeout(() => stop('time'), timeLimit * 1000).unref()
	process.on('SIGTERM', () => {
		if (!stoppedBy) stoppedBy = 'stop'
		process.emit('SIGINT')
	})
	const exclude = values.exclude ? ['--exclude', values.exclude] : []
	await runCli([
		'--concurrency',
		String(CONCURRENCY),
		'--max-requests',
		String(maxRequests),
		'--max-source-bytes',
		String(maxSourceBytes),
		'--max-output-bytes',
		String(MAX_OUTPUT_BYTES),
		...exclude,
		'--',
		question,
		root
	])
	process.stderr.write(
		`Provider requests: ${totals.requests} of ${maxRequests}; request data sent: ${totals.bytes} of ${maxUploadMiB * 1024 * 1024} bytes.\n`
	)
	if (stoppedBy === 'stop') process.exitCode = 130
	else if (stoppedBy) {
		process.stderr.write(
			`Stopped at the ${stoppedBy} limit. The result above is partial. Raise the limit in Settings, Plugins, Jevgrep, or narrow the path.\n`
		)
		process.exitCode = EXIT.budget
	}
}

async function files(values) {
	const root = searchRoot(values.path ?? '.')
	if (values.list !== 'true' && values.list !== 'false')
		throw new AdapterError(EXIT.usage, 'list must be true or false.')
	installMeter({ origin: '', maxRequests: 0, maxBytes: 0, onLimit: () => undefined })
	setTimeout(() => process.emit('SIGINT'), FILES_TIME_LIMIT_MS).unref()
	const exclude = values.exclude ? ['--exclude', values.exclude] : []
	await runCli(['files', ...exclude, ...(values.list === 'true' ? ['--list'] : []), '--', root])
}

const [operation, ...rest] = process.argv.slice(2)
try {
	if (!existsSync(cli)) throw new AdapterError(EXIT.incomplete, 'The pinned jevgrep CLI is missing from this package.')
	if (operation === 'search')
		await search(
			pairs(rest, [
				'provider',
				'max-requests',
				'max-upload-mib',
				'time-limit',
				'max-source-bytes',
				'path',
				'exclude',
				'question'
			])
		)
	else if (operation === 'files') await files(pairs(rest, ['path', 'exclude', 'list']))
	else throw new AdapterError(EXIT.usage, 'Use search or files.')
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
	process.exitCode = error instanceof AdapterError ? error.code : EXIT.usage
}
