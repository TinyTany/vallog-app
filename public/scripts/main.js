//import { Terminal } from 'xterm';

const taCode = document.getElementById('taCode');
const btnRun = document.getElementById('btnRun');
const btnClear = document.getElementById('btnClear');
const taConsole = document.getElementById('taConsole');
const divTerminal = document.getElementById('terminal');
const btnStartDebug = document.getElementById('btnStartDebug');
const btnEndDebug = document.getElementById('btnEndDebug');

// 標準出力すり替え用モジュール
var ConsoleProxy = {};
ConsoleProxy.log_original = console.log;
ConsoleProxy.error_original = console.error;
ConsoleProxy.set = (target, format) => {
    console.log = (...args) => {
        ConsoleProxy.log_original(...args);
        target.value += format(args[0]);
    };
    console.error = (...args) => {
        ConsoleProxy.error_original(...args);
        target.value += format(args[0]);
    };
};
ConsoleProxy.reset = () => {
    console.log = ConsoleProxy.log_original;
    console.error = ConsoleProxy.error_original;
};

// CodeMirrorの設定
let myCodeMirror = CodeMirror.fromTextArea(taCode, {
    mode: 'javascript',
    lineNumbers: true
});

// xtermの設定
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
    ConsoleProxy.set(taConsole, (s) => `> ${JSON.stringify(s)}\n`);
    // プログラム実行
    try {
        window.modules.vm.runInNewContext(code, {console: console});
    }
    catch (e) {
        taConsole.value += e + '\n';
    }
    // すり替えた標準出力を元に戻す
    ConsoleProxy.reset();
};

btnClear.onclick = () => {
    taConsole.value = '';
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
