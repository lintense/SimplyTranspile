/** 
 * A simple Transpiler that remove all TS class annotations in order to be compatible with Browsers
 * This is useful for having the niceties of TypeScript in VS Code editor without having the
 * attrocious transpiling that goes with it - aka ... The best of both worlds!
 */
const fs = require('fs');
const path = require('path');
const openners = "\"'`{(["
const closers = "\"'`})]"

function stack(str, block = []) {

    const operator = []
    const level = [] // Record the amount of lost char in the result vs the original str
    const stack = [] // Record the begining of the block
    let result = "", mustBeSame = false

    // First we stack the groups into blocks
    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        const openIndex = openners.indexOf(char)
        const sameEscape = mustBeSame && str[i - 1] === '\\'

        if (!mustBeSame && openIndex >= 0) {
            stack.push(i)
            operator.push(closers[openIndex])
            mustBeSame = openners[openIndex] === closers[openIndex]
        } else if (operator.length && char === operator[operator.length - 1] && !sameEscape) {
            result = computeResult(char, stack, level, block, result, i, str)
            operator.pop()
            mustBeSame = false
        }
        result += char
    }
    //console.log(result, JSON.stringify(block))
    return { result: result, block: block }
}
function computeResult(char, stack, level, block, result, i, str) {
    const pos = stack.pop()
    const lag = level.slice(0, stack.length + 1).reduce((a, c) => a + c, 0)
    block.push(result.substring(pos + lag))
    const tag = getTag(block.length - 1)

    const newlag = getAdjustment(block, tag)
    level[stack.length] = (level[stack.length] ?? 0) - newlag + 1
    level.splice(stack.length + 1, level.length) // Remove further levels
    const newResult = result.substring(0, pos + 1 + lag) + tag

    let sl = level.slice(0, stack.length + 1).reduce((a, c) => a + c, 0)
    //console.log(newResult.substring(i+sl-15, i+sl) + char + " ==> " + str.substring(i-15, i) + char)
    console.assert(block[block.length - 1].charAt(0) === openners[closers.indexOf(char)])
    return newResult
}
function unstack({ result: str, block }) {
    const tag = getTag(block.length - 1)
    const replacement = block.pop()
    const result = str.replace(tag, replacement.substring(1))
    return block.length ? unstack({ result, block }) : result
}
// https://regexr.com/
const parm_exp = /(static\s*)?(#\s*)?([\w_$]+\s*)\??(\s*:\s*[\w_]+(\s*\[[^\]]*])?)?(\s*=\s*("[^"]*"|'[^']*'|-?\s*\d[^,)]*|new [^)]*\)|\[[^\]]*]|{[^}]*}))?/g
function removeClassAnnotations({ result, block }) {

    // Remove type annotations inside function declaration
    for (const blockId of findBlocks(functionBlock, { result, block })) {
        const s = block[blockId]
        const x = (' ' + block[blockId]).slice(1)
        block[blockId] = s && s.charAt(0) === '(' && s.indexOf('`', 1) < 0 && (s.indexOf(':') > 0 || s.indexOf('?') > 0)
            ? '(' + Array.from(s.matchAll(parm_exp))
                .map(m => m[3] + (m[6] ?? '')).join(', ')
            : s
        if (x != block[blockId]) {
            console.log(x)
            console.log(block[blockId])
        }
    }

    // Remove type annotations directly under class declaration
    for (const blockId of findBlocks(classBlock, { result, block })) {
        const s = block[blockId]
        block[blockId] = block[blockId]
            .split('\n')
            .filter(l => !l || l.indexOf(':') < 0 || l.indexOf('static') >= 0 || l.indexOf('#') >= 0 || l.trim().startsWith('//'))
            .map(s => s && splitComment(s).left.indexOf(':') > 0
                ? Array.from(splitComment(s).left.matchAll(parm_exp))
                    .map(m => keepSpacing(s) + (m[1] ?? '') + (m[2] ?? '') + (m[3] ?? '') + (m[6] ?? '')).join(';') + splitComment(s).right
                : s).join('\n')
    }

    return { result, block }
}
function splitComment(str) {
    const p = str.indexOf('//')
    return p < 0 ? { left: str, right: '' } : { left: str.substring(0, p), right: str.substring(p) }
}
function keepSpacing(str) {
    return str.split('').reduce((a, c) => a.trim() ? a : a + c, ' ').slice(0, -1)
}
const classBlock = /class\s*[\w_]+\s*{~(\d+)~}/g
const functionBlock = /\(~(\d+)~\)\s*({|=>)/g
function* findBlocks(pattern, { result, block }) {
    let match
    while (match = pattern.exec(result))
        yield match[1]
    for (const b of block)
        while (match = pattern.exec(b))
            yield match[1]
}
function getAdjustment(block, tag) {
    let result = block[block.length - 1].length - tag.length
    // Check wether the last block contains a previous one
    const last = block[block.length - 1]
    for (let i = 0; i < block.length - 1; i++) {
        const tag = getTag(i)
        if (last.indexOf(tag) >= 0)
            result += getAdjustment(block.slice(0, i + 1), tag) - 1
    }
    return result
}
function getTag(i) {
    return '~' + i + '~'
}
function transpileText(text) {
    const stacked_text = stack(text)
    //console.log(stacked_text)
    const stacked_filtered = removeClassAnnotations(stacked_text)
    const filtered_text = unstack(stacked_filtered)
    return filtered_text
}



// === NODE JS Section ===



function transpileFile(srcFile, dest) {

    const text = fs.readFileSync(srcFile, "utf8")
    fs.writeFileSync(dest, transpileText(text), (err) => {
        if (err)
            console.log(err);
    })
}
function processFile(filepath) {
    fs.stat(filepath, (ferr, fstats) => {
        const stateFile = stateMap.get(filepath)
        const dest = filepath.replaceAll('ts', 'js')
        if (stateFile && stateFile !== fstats.ctimeMs) {
            console.log('File has been updated! ' + filepath)
            transpileFile(filepath, dest)
        } else {
            fs.stat(dest, (derr, dstats) => {
                if (!dstats || dstats.ctimeMs < fstats.ctimeMs) {
                    console.log('File has been updated! ' + filepath)
                    fs.mkdirSync(path.dirname(dest), { recursive: true })
                    transpileFile(filepath, dest)
                }
            })
        }
        stateMap.set(filepath, fstats.ctimeMs)
    })
}

const { promisify } = require('util')
const { resolve } = require('path')
const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)

async function getFiles(dir) {
    const subdirs = await readdir(dir)
    const files = await Promise.all(subdirs.map(async (subdir) => {
        const res = resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? getFiles(res) : res
    }));
    return files.reduce((a, f) => a.concat(f), [])
}
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs))
const stateMap = new Map()
function watch(tspath) {

    getFiles(tspath)
        .then(files => files.forEach(filepath => processFile(filepath)))
        .catch(e => console.error(e))
    sleep(2000).then(() => watch(tspath))
}

watch('web\\ts')

