import {
	chmodSync,
	copyFileSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { main, pinned, Refusal, run, signedIndex } from './directory.mjs'

/**
 * Makes main show the plugin source that Farero's signed plugin directory pins:
 *
 *   node .github/scripts/sync.mjs [--dry-run]
 *
 * It downloads the index's publicSource archive and checks its sha256. Then it replaces every
 * committed file except .github/workflows/ with the archive's tree, and commits and pushes when
 * that changes main. GITHUB_TOKEN cannot change workflow files, so the sync reports a workflow
 * file that differs from the archive, and a maintainer pushes that change. --dry-run changes
 * the working tree but does not commit or push. Needs git and tar.
 */

const WORKFLOWS = '.github/workflows/'
const REQUIRED = ['.github/farero.json', '.github/scripts/sync.mjs', '.github/scripts/releases.mjs']
const dryRun = process.argv.includes('--dry-run')

/** Regular files below `directory`, as POSIX paths. Refuses a link. */
function files(directory, prefix = '') {
	return readdirSync(directory).flatMap(name => {
		const absolute = path.join(directory, name)
		const stat = lstatSync(absolute)
		if (stat.isDirectory()) return files(absolute, `${prefix}${name}/`)
		if (!stat.isFile()) throw new Refusal(`the source archive has ${prefix}${name}, which is not a regular file`)
		return [`${prefix}${name}`]
	})
}

function differs(file, root) {
	try {
		return !readFileSync(file).equals(readFileSync(path.join(root, file)))
	} catch {
		return true
	}
}

await main(async () => {
	const { index } = await signedIndex()
	const source = index.publicSource
	if (!source) {
		process.stdout.write('The directory index pins no public source yet.\n')
		return
	}
	if (typeof source.url !== 'string' || !/^[0-9a-f]{64}$/.test(source.sha256 ?? ''))
		throw new Refusal('the directory index has an invalid publicSource')
	const work = mkdtempSync(path.join(os.tmpdir(), 'plugin-source-'))
	const archive = path.join(work, 'source.tgz')
	writeFileSync(archive, await pinned(source.url, source.sha256))
	run('tar', ['-xzf', archive, '-C', work])
	const tree = path.join(work, 'source')
	const incoming = files(tree)
	for (const file of REQUIRED)
		if (!incoming.includes(file)) throw new Refusal(`the source archive has no ${file}, so it would stop this sync`)
	const committed = run('git', ['ls-files', '-z']).split('\0').filter(Boolean)
	const workflowChanges = [
		...incoming.filter(file => file.startsWith(WORKFLOWS) && differs(file, tree)),
		...committed.filter(file => file.startsWith(WORKFLOWS) && !incoming.includes(file))
	]
	for (const file of committed) if (!file.startsWith(WORKFLOWS)) rmSync(file)
	for (const file of incoming) {
		if (file.startsWith(WORKFLOWS)) continue
		mkdirSync(path.dirname(file), { recursive: true })
		copyFileSync(path.join(tree, file), file)
		chmodSync(file, lstatSync(path.join(tree, file)).mode & 0o777)
	}
	run('git', ['add', '--all', '--', '.', `:!${WORKFLOWS}`])
	for (const file of workflowChanges)
		process.stdout.write(
			`::warning file=${file}::The signed source changes ${file}. GITHUB_TOKEN cannot push workflow files, so a maintainer must push this change.\n`
		)
	const changed = run('git', ['diff', '--cached', '--name-status'])
	if (!changed.trim()) {
		process.stdout.write(`main already shows the plugin source of directory sequence ${index.sequence}.\n`)
		return
	}
	process.stdout.write(changed)
	if (dryRun) return
	run('git', [
		'-c',
		'user.name=Farero',
		'-c',
		'user.email=noreply@farero.ai',
		'commit',
		'--quiet',
		'-m',
		`Sync the plugin source of directory sequence ${index.sequence}`
	])
	run('git', ['push', '--quiet', 'origin', 'HEAD:main'])
	process.stdout.write(`main now shows the plugin source of directory sequence ${index.sequence}.\n`)
})
