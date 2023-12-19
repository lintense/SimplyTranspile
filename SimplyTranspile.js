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
    const level = [] // Recore the amount of lost char in the result vs the original str
    const stack = [] // Record the begining of the block
    let result = ""

    // First we stack the groups into blocks
    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        let pos = 0
        const isOpenner = openners.indexOf(char) >= 0

        if (isOpenner) {
            stack.push(i)
            operator.push(closers[openners.indexOf(char)])
        } else if (operator.length && char === operator[operator.length - 1]) {
            result = computeResult(char, stack, level, block, result, i, str)
            operator.pop()
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
function unstack(str, block) {
    const tag = getTag(block.length - 1)
    const replacement = block.pop()
    const result = str.replace(tag, replacement.substring(1))
    return block.length ? unstack(result, block) : result
}
function removeClassAnnotations(block) {
    return block.map(s => {
        if (s.charAt(0) === '(' && s.indexOf('(', 1) < 0 && s.indexOf('`', 1) < 0) {
            const pos1 = s.indexOf(':')
            const pos2 = s.indexOf('=', pos1 + 1)
            return pos1 > 0 && pos2 > 0 ? s.substring(0, pos1) + s.substring(pos2) : pos1 > 0 ? s.substring(0, pos1) : s
        } else {
            return s
        }
    })
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
    return '$' + i + '$'
}
function transpileText(text) {
    const st = stack(text)
    //console.log(st)
    const block = removeClassAnnotations(st.block)
    const newText = unstack(st.result, block)
    return newText
}


// === NODE JS Section ===
function readFiles(dir, processFile) {
    // read directory
    fs.readdir(dir, (error, fileNames) => {
        if (error) throw error;

        fileNames.forEach(filename => {
            // get current file name
            const name = path.parse(filename).name;
            // get current file extension
            const ext = path.parse(filename).ext;
            // get current file path
            const filepath = path.resolve(dir, filename);

            // get information about the file
            fs.stat(filepath, function (error, stat) {
                if (error) throw error;

                // check if the current path is a file or a folder
                const isFile = stat.isFile();

                // exclude folders
                if (isFile) {
                    // callback, do something with the file
                    processFile({ filepath: filepath, name: name, ext: ext, stat: stat });
                }
            });
        });
    });
}
function transpileFile(srcFile, dest) {

    const text = fs.readFileSync(srcFile, "utf8")
    fs.writeFileSync(dest, transpileText(text), (err) => {
        if (err)
            console.log(err);
    });
}

// ==== NODE JS STUFF ====

const { promisify } = require('util');
const { resolve } = require('path');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

async function getFiles(dir) {
    const subdirs = await readdir(dir);
    const files = await Promise.all(subdirs.map(async (subdir) => {
        const res = resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? getFiles(res) : res;
    }));
    return files.reduce((a, f) => a.concat(f), []);
}
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs))
const stateMap = new Map()
function watch(tspath) {

    getFiles(tspath)
        .then(files => {
            files.forEach(filepath => {
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
            })
        })
        .catch(e => console.error(e))
    sleep(2000).then(() => watch(tspath))
}

watch('web\\ts')

