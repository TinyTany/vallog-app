//import { Terminal } from 'xterm';

const taCode = document.getElementById('taCode');
const btnRun = document.getElementById('btnRun');
const btnClear = document.getElementById('btnClear');
const divTermOut = document.getElementById('programOutput');
const divTerminal = document.getElementById('terminal');
const btnStartDebug = document.getElementById('btnStartDebug');
const btnEndDebug = document.getElementById('btnEndDebug');

// CodeMirrorの設定
let myCodeMirror = CodeMirror.fromTextArea(taCode, {
    mode: 'javascript',
    lineNumbers: true
});

// xtermのテーマ
const xtermTheme = {
    background: '#1e1e1e',
    foreground: '#d4d4d4',
    black: '#000000',
    brightBlack: '#666666',
    red: '#cd3131',
    brightRed: '#f14c4c',
    green: '#0dbc79',
    brightGreen: '#23d18b',
    yellow: '#e5e510',
    brightYellow: '#f5f543',
    blue: '#2472c8',
    brightBlue: '#3b8eea',
    magenta: '#bc3fbc',
    brightMagenta: '#d670d6',
    cyan: '#11a8cd',
    brightCyan: '#29b8db',
    white: '#e5e5e5',
    brightWhite: '#e5e5e5'
};

// xtermの設定（プログラム実行出力）
let termOut = new Terminal({
    convertEol: true,
    theme: {
        ...xtermTheme,
        cursor: '#1e1e1e',
        cursorAccent: '#1e1e1e'
    },
    fontFamily: '"Cascadia Code", Menlo, monospace',
    fontSize: 15,
    RendererType: 'canvas'
});
termOut.open(divTermOut);

// xtermの設定（デバッグコンソール）
let term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    theme: {
        ...xtermTheme,
        cursor: '#d4d4d4'
    },
    fontFamily: '"Cascadia Code", Menlo, monospace',
    fontSize: 15,
    RendererType: 'canvas'
});
term.open(divTerminal);
term.promptStr = '\u{276f} ';
term.prompt = (str) => {
    if (!str) {
        str = '';
    }
    term.write(`\x1b[38;2;255;114;114m${term.promptStr}\x1b[0m${str}`);
};
term.command = '';
// 実行されたコマンドの履歴
term.history = [];
term.historyIdx = -1; // 0-indexed
term.cursorIdx = term.promptStr.length; // 0-indexed
term.disabled = true;
term.onData(e => {
    // 起点位置から適切にカーソルを移動（マルチライン対応）
    function moveCursor(moveCount) {
        let moveR = moveCount % term.cols;
        let moveD = Math.floor(moveCount / term.cols);
        if (moveD == 0) {
            term.write(`\x1b[u\x1b[${moveR}C`);
        }
        else if (moveR == 0) {
            term.write(`\x1b[u\x1b[${moveD}B`);
        }
        else {
            term.write(`\x1b[u\x1b[${moveD}B\x1b[${moveR}C`);
        }
    }

    if (term.disabled) {
        return;
    }
    switch (e) {
        case '\u007f': { // Backspace
            // コマンド部分の何文字目の上にカーソルがあるか（0-indexed）
            let idx = term.cursorIdx - term.promptStr.length;
            if (idx <= 0) {
                // プロンプト記号だけでコンソールの列数を超えることは無いと想定
                term.write(`\x1b[u\x1b[${term.promptStr.length}C`);
                term.cursorIdx = term.promptStr.length;
                return;
            }
            if (term.command.length < idx) {
                let moveCnt = term.promptStr.length + term.command.length;
                moveCursor(moveCnt);
                term.cursorIdx = moveCnt;
                return;
            }
            // 以下、idxの範囲は[1, term.command.length]と仮定
            if (idx == 1) {
                term.command = term.command.slice(1);
            }
            else if (idx == term.command.length) {
                term.command = term.command.slice(0, term.command.length - 1);
            }
            else {
                term.command = term.command.slice(0, idx - 1) + term.command.slice(idx);
            }
            term.write('\x1b[u\x1b[0J');
            term.prompt(term.command);
            moveCursor(term.promptStr.length + idx - 1);
            term.cursorIdx--;
            return;
        }
        default: {
            if (!(String.fromCharCode(0x20) <= e && e <= String.fromCharCode(0x7e))) {
                return;
            }
            // コマンド部分の何文字目の上にカーソルがあるか（0-indexed）
            let idx = term.cursorIdx - term.promptStr.length;
            if (idx < 0) {
                idx = 0;
            }
            if (term.command.length < idx) {
                idx = term.command.length;
            }
            // 以下、idxの範囲は[0, term.command.length]と仮定
            if (idx == 0) {
                term.command = e + term.command;
            }
            else if (idx == term.command.length) {
                term.command = term.command + e;
            }
            else {
                term.command = term.command.slice(0, idx) + e + term.command.slice(idx);
            }
            term.write('\x1b[u\x1b[0J');
            term.prompt(term.command);
            moveCursor(term.promptStr.length + idx + 1);
            term.cursorIdx++;
            return;
        }
    }
});
term.onKey(e => {
    if (term.disabled) {
        return;
    }
    const ev = e.domEvent;
    switch (ev.key) {
        case 'ArrowLeft': {
            if (term.cursorIdx <= term.promptStr.length) {
                return;
            }
            let curX = term.cursorIdx % term.cols;
            let curY = Math.floor(term.cursorIdx / term.cols);
            if (curY > 0 && curX == 0) {
                term.write(`\x1b[A\x1b[${term.cols - 1}C`);
            }
            else {
                term.write('\x1b[D')
            }
            term.cursorIdx--;
            return;
        }
        case 'ArrowRight': {
            if (term.cursorIdx >= term.promptStr.length + term.command.length) {
                return;
            }
            let curX = term.cursorIdx % term.cols;
            if (curX == term.cols - 1) {
                term.write(`\x1b[B\x1b[${term.cols - 1}D`);
            }
            else {
                term.write('\x1b[C')
            }
            term.cursorIdx++;
            return;
        }
        case 'ArrowUp': {
            if (term.historyIdx == -1 && term.command != '') {
                return;
            }
            if (term.historyIdx >= term.history.length - 1) {
                return;
            }
            term.command = term.history[++term.historyIdx];
            term.write('\x1b[u\x1b[0J');
            term.prompt(term.command);
            term.cursorIdx = term.promptStr.length + term.command.length;
            return;
        }
        case 'ArrowDown': {
            if (term.historyIdx == -1 && term.command != '') {
                return;
            }
            if (term.historyIdx > 0) {
                term.command = term.history[--term.historyIdx];
            }
            else {
                term.historyIdx = -1;
                term.command = '';
            }
            term.write('\x1b[u\x1b[0J');
            term.prompt(term.command);
            term.cursorIdx = term.promptStr.length + term.command.length;
            return;
        }
        case 'Enter': {
            term.historyIdx = -1;
            if (term.command == '') {
                term.write('\r\n\x1b[s');
                term.prompt();
                return;
            }
            if (term.history[0] != term.command) {
                term.history.unshift(term.command);
            }
            let out = '\r\n';
            try {
                let evaled = window.modules.vm.runInNewContext(term.command, window.context);
                out += window.modules.util.inspect(evaled, { colors: true, depth: null });
            }
            catch (e) {
                out += e;
            }
            term.write(out);
            term.command = '';
            term.write('\r\n\x1b[s');
            term.prompt();
            term.cursorIdx = term.promptStr.length;
            return;
        }
        default:
            return;
    }
});

btnRun.onclick = () => {
    termOut.clear();
    const code = myCodeMirror.getValue();
    // 標準出力先をすり替え
    let log = console.log;
    let error = console.error;
    console.log = (...args) => {
        log(...args);
        let out = window.modules.util.inspect(args[0], { colors: true, depth: null });
        termOut.writeln(out);
    }
    console.error = (...args) => {
        error(...args);
        let out = window.modules.util.inspect(args[0], { colors: true, depth: null });
        termOut.writeln(out);
    }
    // プログラム実行
    try {
        window.modules.vm.runInNewContext(code, {console: console});
    }
    catch (e) {
        termOut.writeln(e.toString());
    }
    // すり替えた標準出力を元に戻す
    console.log = log;
    console.error = error;
};

btnClear.onclick = () => {
    termOut.clear();
};

btnStartDebug.onclick = () => {
    term.reset();
    term.historyIdx = -1;
    term.writeln('[info] Debug console activated')
    term.writeln('[info] Transpiling source program');
    let program;
    try {
        program = transform(myCodeMirror.getValue());
        console.log(program); // debug
    }
    catch (e) {
        term.writeln(e.toString());
        term.writeln('[error] Transpile failed');
        return;
    }
    term.writeln('[info] Transpile success');
    term.writeln('[info] Running transpiled program');
    VALLOG.init();
    let vals = window.modules.vm.runInNewContext(program, {VALLOG: VALLOG, console: console});
    term.writeln('[info] Success');
    term.writeln('[info] Ready');
    term.write('\r\n\x1b[s');
    term.prompt();
    term.focus();
    term.disabled = false;
    window.context = {vals: vals};
    myCodeMirror.setOption('readOnly', true);
    btnEndDebug.removeAttribute('disabled');
    btnStartDebug.setAttribute('disabled', true);
};

btnEndDebug.onclick = () => {
    term.writeln('\r\n[info] Debug console terminated')
    term.disabled = true;
    myCodeMirror.setOption('readOnly', false);
    btnEndDebug.setAttribute('disabled', true);
    btnStartDebug.removeAttribute('disabled');
};

// 描画
let canvas = document.getElementById('canvas');
if (canvas.getContext) {
    var ctx = canvas.getContext('2d');
    let si = myCodeMirror.getScrollInfo();
    canvas.width = si.width;
    canvas.height = si.height
    // canvasのサイズ確認用コード
    {
        // ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(canvas.width, canvas.height);
        ctx.moveTo(0, canvas.height);
        ctx.lineTo(canvas.width, 0);
        ctx.stroke();
    }
}
else {
    // canvas-unsupported code here
}