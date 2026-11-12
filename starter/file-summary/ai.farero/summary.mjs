import { readFile } from 'node:fs/promises'

// Arguments arrive as separate literal values: label, maxLines and the saved heading.
// The package reads its own resources relative to this file, never relative to the cwd.
const [label, rawMaxLines, heading] = process.argv.slice(2)
const maxLines = Number(rawMaxLines)
if (label === undefined || heading === undefined || !Number.isInteger(maxLines) || maxLines < 1 || maxLines > 10) {
	process.stderr.write('Expected label, maxLines (1 to 10) and heading.\n')
	process.exitCode = 2
} else {
	const source = await readFile(new URL('./fixture.txt', import.meta.url), 'utf8')
	const text = source.replace(/\r\n/g, '\n').replace(/\n$/, '')
	const lines = text === '' ? [] : text.split('\n')
	const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
	process.stdout.write(`${heading}: ${label}\nLines: ${lines.length}\nWords: ${words}\n`)
	process.stdout.write(`First ${maxLines} lines:\n${lines.slice(0, maxLines).join('\n')}\n`)
}
