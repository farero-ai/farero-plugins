import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Packs the starter and each plugin folder that Farero packs as it is, with the installed
 * farero command:
 *
 *   node .github/scripts/check.mjs
 *
 * `farero plugins pack` validates a folder before it packs it. A folder with release/upstream.json
 * or release/sources.json is built by its recipe in Farero's release pipeline, so this check
 * skips it. When a packed folder's version has a release here, the new archive must have the
 * same sha256 as the release archive, because a release never changes. Needs GH_TOKEN.
 */

const repository = process.env.GITHUB_REPOSITORY
const work = mkdtempSync(path.join(os.tmpdir(), 'plugin-check-'))
const folders = ['plugins', 'starter'].flatMap(parent =>
	readdirSync(parent, { withFileTypes: true })
		.filter(item => item.isDirectory() && existsSync(path.join(parent, item.name, 'plugin.json')))
		.map(item => `${parent}/${item.name}`)
)
const problems = []

function releaseDigest(tag, asset) {
	try {
		return execFileSync(
			'gh',
			['api', `repos/${repository}/releases/tags/${tag}`, '--jq', `.assets[] | select(.name == "${asset}") | .digest`],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		).trim()
	} catch {
		return ''
	}
}

for (const folder of folders) {
	if (['upstream.json', 'sources.json'].some(file => existsSync(path.join(folder, 'release', file)))) {
		process.stdout.write(`${folder}: built by its recipe in Farero's release pipeline.\n`)
		continue
	}
	const { name, version } = JSON.parse(readFileSync(path.join(folder, 'plugin.json'), 'utf8'))
	let receipt
	try {
		receipt = JSON.parse(
			execFileSync('farero', ['plugins', 'pack', folder, '--out', path.join(work, `${name}.tgz`), '--json'], {
				encoding: 'utf8'
			})
		)
	} catch (error) {
		problems.push(`${folder} does not pack:\n${error.stdout ?? error.message}`)
		continue
	}
	const asset = `${name}-${version}.tgz`
	const released = releaseDigest(`${name}-v${version}`, asset)
	if (released && released !== `sha256:${receipt.sha256}`)
		problems.push(
			`${folder} packs to sha256 ${receipt.sha256}, but release ${name}-v${version} has ${released}. Changed content needs a new version.`
		)
	else
		process.stdout.write(
			`${folder}: ${name} ${version} packs to ${receipt.sha256}${released ? ', the same archive as its release' : ''}.\n`
		)
}
if (problems.length) {
	process.stderr.write(`${problems.join('\n')}\n`)
	process.exit(1)
}
