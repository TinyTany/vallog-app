const parser = window.modules.babel_parser;
const traverse = window.modules.babel_traverse;
const generate = window.modules.babel_generator;
const template = window.modules.babel_template;
const types = window.modules.babel_types;

// const parser = require('@babel/parser');
// const traverse = require('@babel/traverse');
// const generate = require('@babel/generator');
// const template = require('@babel/template');
// const types = require('@babel/types');

// special form name
const spf_cp_exp_normal = 'MK_EXP';
const spf_cp_exp_static = 'MK_EXP_ST';
const spf_cp_exp_dynamic = 'MK_EXP_DY';
const spf_cp_block_static = 'MK_BLK_ST';
const spf_cp_block_dynamic = 'MK_BLK_DY';
const spf_cp_assert = 'MK_ASSERT';

const funNamePass = '__PASS_VAL';
const funNameGetVal = '__GET_VAL';
const VarNameRefs = '__VAR_REFS';

const dynamicCpPush = '__DY_CP_PUSH';
const dynamicCpExpSave = '__DY_EXP_SAVE';
const dynamicCpExpRestore = '__DY_EXP_RESTORE';
const dynamicCpBlockSave = '__DY_BLK_SAVE';
const dynamicCpBlockRestore = '__DY_BLK_RESTORE';
const dynamicCpFunctionSave = '__DY_FUN_SAVE';
const dynamicCpFunctionRestore = '__DY_FUN_RESTORE';
const dynamicCpExceptionSave = '__DY_EXCP_SAVE';
const dynamicCpExceptionRestore = '__DY_EXCP_RESTORE';

const getId = (() => {
    let id = 0;
    return () => {
        return `ID_${id++}`;
    };
})();

/** @type {string[]} */
let testExpIdStack;
/** @type {string[]} */
let staticExpCpStack;
/** @type {string[][]} */
let staticBlockCpStack;

const debugMode = false;
function debugLog(str) {
    if (debugMode) {
        console.log(str);
    }
}

/* 補助関数たち */

function codePositionStr(node) {
    return `(${node.loc.start.line}:${node.loc.start.column})`;
}

function validateCpExpPath(path) {
    // 存在&型チェック
    if (path.node.arguments.length < 2) {
        throw `SyntaxError: Missing arguments ${codePositionStr(path.node)}`;
    }
    if (path.node.arguments[1].type != 'StringLiteral') {
        throw `SyntaxError: Checkpoint name must be string literal ${codePositionStr(path.node)}`
    }
}

function validateCpBlockPath(path) {
    // 存在&型チェック
    if (path.node.arguments.length < 1) {
        throw `SyntaxError: Missing arguments ${codePositionStr(path.node)}`;
    }
    if (path.node.arguments[0].type != 'StringLiteral') {
        throw `SyntaxError: Checkpoint name must be string literal ${codePositionStr(path.node)}`
    }
    // BlockStatement内のExpressionStatementとなっているかチェック
    if (path.parentPath.node.type != 'ExpressionStatement' ||
    path.parentPath.parentPath.node.type != 'BlockStatement') {
        throw `SyntaxError: cp_block must be statement in block ${codePositionStr(path.node)}`;
    }
}

/** 
 * pathに追加で付与するプロパティについて
 * mySkip: これがtrueの場合，それ以下のpathに対してプログラム変換をしないようにする
 * API側で用意されているshouldSkipを使うと何かうまくいかないことがあった（忘れた）ので，代わりにこれを使用
 * 
 * nodeに追加で付与するプロパティについて
 * getValMode: trueの場合，そのnodeを包む追跡子情報取得関数にpassではなくgetValを使う
 * noVallogize: trueの場合，そのnodeは追跡子情報取得関数で包まない
 * pushIdRequest: そのnodeがtest式のとき，そのidをスタックにpushするリクエスト
 * relId: そのnode（式）を識別するための数値id
 * name: そのnode（式）が変数の場合にその名前を文字列で保持しておく
 * cpNames: そのnode（式）に設置すべきcheckpoint
 */

function transform(program, option) {
    // 初期化
    testExpIdStack = [];
    staticExpCpStack = [];
    staticBlockCpStack = [];

    // オプション設定
    const implcpArrayRef = option?.implcp?.arrayRef ?? false;
    const implcpIfTest = option?.implcp?.ifTest ?? false;

    let ast = parser.parse(program);

    traverse.default(ast, {
        enter(path) {
            if (path.mySkip) {
                debugLog('enter: skipped');
                path.shouldSkip = true;
                return;
            }
            switch(path.node.type) {
                case 'FunctionDeclaration': {
                    debugLog('func enter');
                    path.node.id.noVallogize = true;
                    // 仮引数には識別子のみ現れると仮定
                    path.get('params').forEach(p => p.mySkip = true);
                    return;
                }
                case 'ArrowFunctionExpression': {
                    path.get('params').forEach(p => p.mySkip = true);
                    return;
                }
                case 'LogicalExpression':
                case 'BinaryExpression': {
                    debugLog(`binexp enter(${path.node.operator})`);
                    path.node.left.getValMode = true;
                    path.node.right.getValMode = true;
                    return;
                }
                case 'Identifier': {
                    debugLog(`id enter(${path.node.name})`);
                    return;
                }
                case 'CallExpression': {
                    debugLog('callexp enter');
                    const callee = path.node.callee;
                    // special formの処理
                    if (callee.type == 'Identifier') {
                        switch (callee.name) {
                            case spf_cp_exp_normal: {
                                // validation
                                validateCpExpPath(path);

                                const exp = path.node.arguments[0];
                                const cpName = path.node.arguments[1].value;
                                // メタ情報の引継ぎ
                                exp.getValMode = path.node.getValMode;
                                exp.noVallogize = path.node.noVallogize;
                                exp.pushIdRequest = path.node.pushIdRequest;
                                exp.cpNames = path.node.cpNames; // 入れ子OK
                                // pathの繋ぎ変え
                                path.replaceWith(exp);
                                // cpNameを付与
                                if (!path.node.cpNames) {
                                    path.node.cpNames = [];
                                }
                                path.node.cpNames.push(cpName);
                                return;
                            }
                            case spf_cp_exp_static: {
                                // validation
                                validateCpExpPath(path);

                                const exp = path.node.arguments[0];
                                const cpName = path.node.arguments[1].value;
                                // メタ情報の引継ぎ
                                exp.getValMode = path.node.getValMode;
                                exp.noVallogize = path.node.noVallogize;
                                exp.pushIdRequest = path.node.pushIdRequest;
                                exp.cpNames = path.node.cpNames; // 入れ子OK
                                // cpNameをstaticに反映
                                staticExpCpStack.push(cpName);
                                // pathの繋ぎ変えはまだやらない（exitでやる）
                                // special formを変換対象から外しておく
                                callee.noVallogize = true;
                                return;
                            }
                            case spf_cp_exp_dynamic: {
                                // validation
                                validateCpExpPath(path);

                                const exp = path.node.arguments[0];
                                // メタ情報の引継ぎ
                                exp.getValMode = path.node.getValMode;
                                exp.noVallogize = path.node.noVallogize;
                                exp.pushIdRequest = path.node.pushIdRequest;
                                exp.cpNames = path.node.cpNames; // 入れ子OK
                                // pathの繋ぎ変えはまだやらない（exitでやる）
                                // special formを変換対象から外しておく
                                callee.noVallogize = true;
                                path.node.arguments[1].noVallogize = true;
                                return;
                            }
                            case spf_cp_block_static: {
                                // validation
                                validateCpBlockPath(path);
                                // メインの仕事
                                const cpName = path.node.arguments[0].value;
                                if (staticBlockCpStack.length != 0) {
                                    const lst = staticBlockCpStack.length - 1;
                                    staticBlockCpStack[lst].push(cpName);
                                }
                                path.remove();
                                return;
                            }
                            case spf_cp_block_dynamic: {
                                // validation
                                validateCpBlockPath(path);
                                // メインの仕事
                                callee.name = dynamicCpPush;
                                path.get('callee').mySkip = true;
                                path.get('arguments').forEach(p => p.mySkip = true);
                                return;
                            }
                            default: break;
                        }
                    }
                    // 通常の関数呼び出しの場合の処理
                    callee.getValMode = true;
                    return;
                }
                case 'BlockStatement': {
                    // spf_cp_block_static
                    staticBlockCpStack.push([]);
                    // dynamicCp関連
                    // restore用コードもここで挿入している
                    // ※もし，ほかのノードでブロックの末尾に何かを挿入するものがあるなら，
                    // restore用コードはexitのBlockStatementで挿入しなければならない
                    const parentType = path.parentPath.node.type;
                    if (parentType === 'FunctionDeclaration' ||
                    parentType === 'ArrowFunctionExpression') {
                        // save
                        const cpFunSaveNode = template.statement.ast(`${dynamicCpFunctionSave}()`);
                        path.unshiftContainer('body', cpFunSaveNode);
                        path.get('body.0').mySkip = true;
                        // restore
                        const cpFunRestoreNode = template.statement.ast(`${dynamicCpFunctionRestore}()`);
                        path.pushContainer('body', cpFunRestoreNode);
                        const lst = path.node.body.length - 1;
                        path.get(`body.${lst}`).mySkip = true;
                        return;
                    }
                    if (parentType === 'TryStatement') {
                        // save
                        const cpExcpSaveNode = template.statement.ast(`${dynamicCpExceptionSave}()`);
                        path.unshiftContainer('body', cpExcpSaveNode);
                        path.get('body.0').mySkip = true;
                        // restore
                        const cpExcpRestoreNode = template.statement.ast(`${dynamicCpExceptionRestore}()`);
                        path.pushContainer('body', cpExcpRestoreNode);
                        const lst = path.node.body.length - 1;
                        path.get(`body.${lst}`).mySkip = true;
                        return;
                    }
                    // save
                    const cpBlockSaveNode = template.statement.ast(`${dynamicCpBlockSave}()`);
                    path.unshiftContainer('body', cpBlockSaveNode);
                    path.get('body.0').mySkip = true;
                    // restore
                    const cpBlockRestoreNode = template.statement.ast(`${dynamicCpBlockRestore}()`);
                    path.pushContainer('body', cpBlockRestoreNode);
                    const lst = path.node.body.length - 1;
                    path.get(`body.${lst}`).mySkip = true;
                    if (parentType === 'CatchClause') {
                        // restore
                        const cpExcpRestoreNode = template.statement.ast(`${dynamicCpExceptionRestore}()`);
                        path.unshiftContainer('body', cpExcpRestoreNode);
                        path.get('body.0').mySkip = true;
                    }
                    return;
                }
                case 'ReturnStatement': {
                    debugLog('return enter');
                    return;
                }
                case 'VariableDeclarator': {
                    path.node.id.noVallogize = true;
                    return;
                }
                case 'MemberExpression': {
                    path.node.property.noVallogize = !path.node.computed;
                    path.node.property.getValMode = true;
                    path.node.object.getValMode = true;
                    return;
                }
                case 'ObjectProperty': {
                    path.node.key.noVallogize = true;
                    return;
                }
                case 'CatchClause': {
                    path.node.param.noVallogize = true;
                    return;
                }
                case 'IfStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                case 'ForStatement': {
                    path.node.test.getValMode = true;
                    // test式のidをスタックにpushするリクエスト
                    // このリクエストはVallogize関数内で処理
                    path.node.test.pushIdRequest = true;
                    return;
                }
                case 'AssignmentExpression': {
                    path.node.left.noVallogize = true;
                    return;
                }
                case 'ExpressionStatement': {
                    // void関数呼出の返値undefinedなどの不要な追跡値を防止
                    // HACK: ExpressionStatementになるのは関数呼び出しだけではないので，この対処は不適切かも
                    path.node.expression.noVallogize = true;
                    return;
                }
                default:
                    return;
            };
        },
        exit(path) {
            if (path.mySkip) { 
                debugLog('exit: skipped');
                path.shouldSkip = true;
                return; 
            }
            switch(path.node.type) {
                case 'FunctionDeclaration': {
                    var params = path.node.params.map(x => PassStatAst(x.name, x.loc, '[]'));
                    params.forEach(x => {
                        path.get('body').unshiftContainer('body', x);
                        path.get('body.body.0').mySkip = true;
                    });
                    debugLog('func exit');
                    return;
                }
                case 'ArrowFunctionExpression': {
                    if (path.node.body.type != 'BlockStatement') {
                        var rtrn = types.returnStatement(path.node.body);
                        var blck = types.blockStatement([rtrn]);
                        path.get('body').replaceWith(blck);
                    }
                    var params = path.node.params.map(x => PassStatAst(x.name, x.loc, '[]'));
                    params.forEach(x => {
                        path.get('body').unshiftContainer('body', x);
                        path.get('body.body.0').mySkip = true;
                    });
                    var id = getId();
                    vallogize(path, id);
                    path.node.relId = id;
                    return;
                }
                case 'VariableDeclarator': {
                    // 宣言のみの場合
                    if (!path.node.init) {
                        return;
                    }
                    var lhs = path.node.id;
                    var ast = PassExpAst(lhs.name, lhs.loc, '[]');
                    var node = types.variableDeclarator(types.identifier(`__DUMMY_${getId()}`), ast);
                    path.insertAfter(node);
                    path.getNextSibling().mySkip = true;
                    return;
                }
                case 'AssignmentExpression': {
                    // HACK: 副作用を起こすgetterに対して不適切な実装
                    var lhs = path.node.left;
                    var ast = types.callExpression(
                        types.identifier(funNamePass),
                        [
                            lhs,
                            types.numericLiteral(lhs.loc.start.line),
                            types.numericLiteral(lhs.loc.start.column),
                            types.numericLiteral(lhs.loc.end.line),
                            types.numericLiteral(lhs.loc.end.column),
                            types.arrayExpression([]),
                            types.stringLiteral('_'),
                            types.identifier(lhs.name ?? '')
                        ]);
                    var seq = types.sequenceExpression([path.node, ast]);
                    path.replaceWith(seq);
                    path.mySkip = true;
                    return;
                }
                case 'LogicalExpression':
                case 'BinaryExpression': {
                    var id = getId();
                    vallogize(path, id, [path.node.left.relId, path.node.right.relId]);
                    path.node.relId = id;
                    debugLog(`binexp(logexp) exit(${path.node.operator})`);
                    return;
                }
                case 'NullLiteral':
                case 'StringLiteral':
                case 'BooleanLiteral':
                case 'NumericLiteral':
                case 'Identifier': {
                    var id = getId();
                    vallogize(path, id);
                    path.node.relId = id;
                    debugLog(`id exit(${path.node.name})`);
                    return;
                }
                case 'TemplateLiteral': {
                    var id = getId();
                    vallogize(path, id, path.node.expressions.map(e => e.relId));
                    path.node.relId = id;
                    return;
                }
                case 'ObjectExpression': {
                    var id = getId();
                    vallogize(path, id, path.node.properties.map(e => e.value.relId));
                    path.node.relId = id;
                    return;
                }
                case 'ArrayExpression': {
                    var id = getId();
                    vallogize(path, id, path.node.elements.map(e => e.relId));
                    path.node.relId = id;
                    return;
                }
                case 'CallExpression': {
                    // special formの処理
                    const callee = path.node.callee;
                    if (callee.type == 'Identifier' &&
                    callee.name == spf_cp_exp_static) {
                        staticExpCpStack.pop();
                        const exp = path.node.arguments[0];
                        // pathの繋ぎ変え
                        path.replaceWith(exp);
                        path.mySkip = true;
                        return;
                    }
                    if (callee.type == 'Identifier' &&
                    callee.name == spf_cp_exp_dynamic) {
                        const tmpVarIdNode = types.identifier(`__DUMMY_${getId()}`);
                        const exp = path.node.arguments[0];
                        const cpName = path.node.arguments[1].value;
                        const cpSaveNode = template.expression.ast(`${dynamicCpExpSave}()`);
                        const cpPushNode = template.expression.ast(`${dynamicCpPush}('${cpName}')`);
                        const cpRestoreNode = template.expression.ast(`${dynamicCpExpRestore}()`);
                        const assignNode = types.assignmentExpression(
                            '=',
                            tmpVarIdNode,
                            exp);
                        // pathの繋ぎ変え
                        var seq = types.sequenceExpression([
                            cpSaveNode,
                            cpPushNode,
                            assignNode,
                            cpRestoreNode,
                            tmpVarIdNode
                        ]);
                        path.replaceWith(seq);
                        path.mySkip = true;
                        return;
                    }
                    // 通常の関数呼び出しの場合の処理
                    var id = getId();
                    var rel = [callee.relId];
                    path.node.arguments.forEach(a => rel.push(a.relId));
                    vallogize(path, id, rel);
                    path.node.relId = id;
                    debugLog('callexp exit');
                    return;
                }
                case 'BlockStatement': {
                    // spf_cp_block_static
                    staticBlockCpStack.pop();
                    return;
                }
                case 'ReturnStatement': {
                    debugLog('return exit');
                    const argNode = path.node.argument ?? types.identifier('undefined');
                    const tmpVarIdNode = types.identifier(`__DUMMY_${getId()}`);
                    const assignNode = types.assignmentExpression(
                        '=',
                        tmpVarIdNode,
                        argNode);
                    const restoreNode = template.expression.ast(`${dynamicCpFunctionRestore}()`);
                    const newNode = types.sequenceExpression([
                        assignNode,
                        restoreNode,
                        tmpVarIdNode
                    ]);
                    path.get('argument').replaceWith(newNode);
                    path.get('argument').mySkip = true;
                    return;
                }
                case 'MemberExpression': {
                    var id = getId();
                    var rel = undefined;
                    if (path.node.computed) {
                        rel = [path.node.object.relId, path.node.property.relId];
                    }
                    vallogize(path, id, rel);
                    path.node.relId = id;
                    return;
                }
                case 'IfStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                case 'ForStatement': {
                    testExpIdStack.pop();
                    return;
                }
                default:
                    return;
            };
        }
    });

    return `(() => {
        const ${funNamePass} = VALLOG.function.pass;
        const ${funNameGetVal} = VALLOG.function.getVal;
        const ${VarNameRefs} = VALLOG.data.refs;
        const ${dynamicCpPush} = VALLOG.function.dynamicCpPush;
        const ${dynamicCpExpSave} = VALLOG.function.dynamicCpExpStackSave;
        const ${dynamicCpExpRestore} = VALLOG.function.dynamicCpExpStackRestore;
        const ${dynamicCpBlockSave} = VALLOG.function.dynamicCpBlockStackSave;
        const ${dynamicCpBlockRestore} = VALLOG.function.dynamicCpBlockStackRestore;
        const ${dynamicCpFunctionSave} = VALLOG.function.dynamicCpFunctionStackSave;
        const ${dynamicCpFunctionRestore} = VALLOG.function.dynamicCpFunctionStackRestore;
        const ${dynamicCpExceptionSave} = VALLOG.function.dynamicCpExceptionStackSave;
        const ${dynamicCpExceptionRestore} = VALLOG.function.dynamicCpExceptionStackRestore;
        
        try {
            ${generate.default(ast).code}
        } catch (e) {
            console.error(e);
        }

        return VALLOG.data.vals;
    })();`;
}

function vallogize(path, selfId, relIds) {
    if (path.node.noVallogize) {
        path.node.noVallogize = false;
        return;
    }
    var funcName = funNamePass;
    if (path.node.getValMode) {
        path.node.getValMode = false;
        funcName = funNameGetVal;
    }
    var line1 = path.node.loc.start.line;
    var char1 = path.node.loc.start.column;
    var line2 = path.node.loc.end.line;
    var char2 = path.node.loc.end.column;
    var relIds = (relIds ?? []);
    // ここの挙動にはバリエーションがありそう
    // 全ての外側のスコープの条件式をrelIdsに含める
    // testExpIdStack.forEach(id => {
    //     relIds.push(id);
    // });
    // または、
    // 外側の一番内側のスコープの条件式のみをrelIdsに含める
    if (testExpIdStack.length != 0) {
        let lst = testExpIdStack.length - 1;
        relIds.push(testExpIdStack[lst]);
    }
    
    relIds = relIds.filter(k => k != undefined).map(k => types.identifier(`${VarNameRefs}['${k}']`));
    
    let cpNames = [];
    // spf_cp_exp_normal
    if (path.node.cpNames) {
        cpNames = path.node.cpNames.map(cp => types.stringLiteral(cp));
    }
    // spf_exp_static
    staticExpCpStack.forEach(cp => {
        cpNames.push(types.stringLiteral(cp));
    });
    // spf_block_static
    staticBlockCpStack.flat().forEach(cp => {
        cpNames.push(types.stringLiteral(cp));
    });

    // HACK: 順番が大事
    // このコードをrelIdsの作成完了前に持ってくると、「「自身の値」に関与する値」に「自身の値」が含まれてしまう
    if (path.node.pushIdRequest) {
        path.node.pushIdRequest = false;
        testExpIdStack.push(selfId);   
    }

    // ここの優先順位の理由は何？
    var idName = '';
    if (path.node.type == 'Identifier') {
        idName = path.node.name;
    }
    if (path.node.varName != undefined) {
        idName = path.node.varName;
    }

    path.replaceWith(
        types.callExpression(
            types.identifier(`${funcName}`),
            [
                path.node,
                types.numericLiteral(line1),
                types.numericLiteral(char1),
                types.numericLiteral(line2),
                types.numericLiteral(char2),
                types.arrayExpression(relIds),
                types.stringLiteral(selfId),
                types.stringLiteral(idName),
                types.arrayExpression(cpNames),
            ]));
    path.mySkip = true;
}

// TODO: vallogize関数の変更を受けず独立しているため良くない。なんとかする
function PassExpAst(val, loc, rel) {
    let line1 = loc.start.line;
    let char1 = loc.start.column;
    let line2 = loc.end.line;
    let char2 = loc.end.column;
    return template.expression.ast(`${funNamePass}(${val}, ${line1}, ${char1}, ${line2}, ${char2}, ${rel}, '_', '${val}')`);
}

// 仮引数の行を通過したことを記録するための補助関数
// TODO: vallogize関数の変更を受けず独立しているため良くない。なんとかする
function PassStatAst(val, loc, rel) {
    let line1 = loc.start.line;
    let char1 = loc.start.column;
    let line2 = loc.end.line;
    let char2 = loc.end.column;
    return template.statement.ast(`${funNamePass}(${val}, ${line1}, ${char1}, ${line2}, ${char2}, ${rel}, '_', '${val}');`);
}
