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

// xtermの設定（プログラム実行出力）
let termOut = new Terminal({
    convertEol: true,
    theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#1e1e1e',
        cursorAccent: '#1e1e1e'
    },
    fontFamily: 'Ubuntu Mono, courier-new, courier, monospace',
    fontSize: 16
});
termOut.open(divTermOut);

// xtermの設定（デバッグコンソール）
let term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4'
    },
    fontFamily: 'Ubuntu Mono, courier-new, courier, monospace',
    fontSize: 16
});
term.open(divTerminal);
term.prompt = () => {
    term.write('\r\n$ ');
};
term.command = '';
term.disabled = true;
// pasteに対応できるようにonDataのほうが良い
term.onKey(e => { // TODO: 矢印キーでカーソルが想定外に動かないようにする
    if (term.disabled) {
        return;
    }
    const ev = e.domEvent;
    const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;
    // Enter
    if (ev.keyCode === 13) {
        if (term.command == '') {
            term.prompt();
            return;
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
        term.prompt();
        return;
    }
    // BackSpace
    if (ev.keyCode === 8) {
        if (term.command.length > 0) {
            term.write('\b \b');
            term.command = term.command.substr(0, term.command.length - 1);
        }
        return;
    }
    if (printable) {
        term.command += e.key;
        term.write(e.key);
    }
});

btnRun.onclick = () => {
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
    term.writeln('[info] Debug console activated')
    term.writeln('[info] Transpiling source program');
    let program = transform(myCodeMirror.getValue());console.log(program);
    term.writeln('[info] Transpile success');
    term.writeln('[info] Running transpiled program');
    let vals = window.modules.vm.runInNewContext(program, {VALLOG: VALLOG, console: console});
    term.writeln('[info] Success');
    term.writeln('[info] Ready');
    term.prompt();
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
