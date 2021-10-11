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
    try {
        // let s = new window.modules.sandbox();
        // s.run(code, (out) => {
        //     taConsole.value += '> ' + out.console;
        // });

    }
    catch (e) {
        taConsole.value += e + '\n';
    }
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
            out = eval(command);
        }
        catch (e) {
            out += e;
        }
        taDebugConsole.value += `${out}\n`;
    }
};

btnStartDebug.onclick = () => {
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