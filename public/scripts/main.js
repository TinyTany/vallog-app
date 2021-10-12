const taCode = document.getElementById('taCode');
const btnRun = document.getElementById('btnRun');
const btnClear = document.getElementById('btnClear');
const taConsole = document.getElementById('taConsole');
const taDebugConsole = document.getElementById('taDebugConsole');
const queryInput = document.getElementById('queryInput');
const btnStartDebug = document.getElementById('btnStartDebug');
const btnEndDebug = document.getElementById('btnEndDebug');

let myCodeMirror = CodeMirror.fromTextArea(taCode, {
    mode: 'javascript',
    lineNumbers: true
});

btnRun.onclick = () => {
    const code = myCodeMirror.getValue();
    // 標準出力先をすり替え
    const log = console.log;
    console.log = (...args) => {
        log(...args);
        taConsole.value += `> ${JSON.stringify(args[0])}\n`;
    };
    const error = console.error;
    console.error = (...args) => {
        error(...args);
        taConsole.value += `> ${args[0]}\n`;
    };
    try {
        window.modules.vm.runInNewContext(code, {console: console});
    }
    catch (e) {
        taConsole.value += e + '\n';
    }
    // すり替えた標準出力を元に戻す
    console.log = log;
    console.error = error;
};

btnClear.onclick = () => {
    taConsole.value = '';
};

queryInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const command = queryInput.value;
        queryInput.value = '';
        taDebugConsole.value += `> ${command}\n`;
        let out;
        try {
            out = window.modules.vm.runInNewContext(command, window.context);
        }
        catch (e) {
            out += e;
        }
        taDebugConsole.value += `${out}\n`;
    }
};

btnStartDebug.onclick = () => {
    window.context = {};
    myCodeMirror.setOption('readOnly', true);
    queryInput.removeAttribute('disabled');
    btnEndDebug.removeAttribute('disabled');
    btnStartDebug.setAttribute('disabled', true);
};

btnEndDebug.onclick = () => {
    myCodeMirror.setOption('readOnly', false);
    queryInput.setAttribute('disabled', true);
    btnEndDebug.setAttribute('disabled', true);
    btnStartDebug.removeAttribute('disabled');
};