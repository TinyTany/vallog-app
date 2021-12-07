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
const spf_cp_exp = 'cp_exp';
const spf_cp_block_static = 'cp_block_static';
const spf_cp_block_dynamic = 'cp_block_dynamic';
const spf_cp_assert = 'cp_assert';

const getId = (() => {
    let id = 0;
    return () => {
        return `id${id++}`;
    };
})();

let testExpIdStack = [];

const debugMode = false;
function debugLog(str) {
    if (debugMode) {
        console.log(str);
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

function transform(program) {
    let ast = parser.parse(program);

    traverse.default(ast, {
        enter(path) {
            if (path.mySkip) {
                path.mySkip = false;
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
                    if (callee.type == 'Identifier') {
                        switch (callee.name) {
                            case spf_cp_exp: {
                                // 存在&型チェックすべき？
                                const exp = path.node.arguments[0];
                                const cpName = path.node.arguments[1].value;
                                // メタ情報の引継ぎ
                                exp.getValMode = path.node.getValMode;
                                exp.noVallogize = path.node.noVallogize;
                                exp.pushIdRequest = path.node.pushIdRequest;
                                // pathの繋ぎ変え
                                path.replaceWith(exp);
                                if (!path.node.cpNames) {
                                    path.node.cpNames = [];
                                }
                                path.node.cpNames.push(cpName);
                                return;
                            }
                            case spf_cp_block_static: {
                                // TODO: Not implemented yet
                                return;
                            }
                            case spf_cp_block_dynamic: {
                                // TODO: Not implemented yet
                                return;
                            }
                            default: break;
                        }
                    }
                    callee.getValMode = true;
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
                path.mySkip = false;
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
                    var node = types.variableDeclarator(types.identifier(`__dummy${getId()}`), ast);
                    path.insertAfter(node);
                    path.getSibling(path.key + 1).mySkip = true;
                    return;
                }
                case 'AssignmentExpression': {
                    // HACK: 副作用を起こすgetterに対して不適切な実装
                    var lhs = path.node.left;
                    var ast = types.callExpression(
                        types.identifier(`__pass`),
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
                    var id = getId();
                    var rel = [path.node.callee.relId];
                    path.node.arguments.forEach(a => rel.push(a.relId));
                    vallogize(path, id, rel);
                    path.node.relId = id;
                    debugLog('callexp exit');
                    return;
                }
                case 'ReturnStatement': {
                    debugLog('return exit');
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
        var __pass = VALLOG.function.pass;
        var __getVal = VALLOG.function.getVal;
        var __refs = VALLOG.data.refs;
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
    var funcName = '__pass';
    if (path.node.getValMode) {
        path.node.getValMode = false;
        funcName = '__getVal';
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
    
    relIds = relIds.filter(k => k != undefined).map(k => types.identifier(`__refs['${k}']`));
    
    let cpNames = [];
    if (path.node.cpNames) {
        cpNames = path.node.cpNames.map(cp => types.stringLiteral(cp));
    }

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
                types.arrayExpression(cpNames)
            ]));
    path.mySkip = true;
}

// TODO: vallogize関数の変更を受けず独立しているため良くない。なんとかする
function PassExpAst(val, loc, rel) {
    let line1 = loc.start.line;
    let char1 = loc.start.column;
    let line2 = loc.end.line;
    let char2 = loc.end.column;
    return template.expression.ast(`__pass(${val}, ${line1}, ${char1}, ${line2}, ${char2}, ${rel}, '_', '${val}')`);
}

// 仮引数の行を通過したことを記録するための補助関数
// TODO: vallogize関数の変更を受けず独立しているため良くない。なんとかする
function PassStatAst(val, loc, rel) {
    let line1 = loc.start.line;
    let char1 = loc.start.column;
    let line2 = loc.end.line;
    let char2 = loc.end.column;
    return template.statement.ast(`__pass(${val}, ${line1}, ${char1}, ${line2}, ${char2}, ${rel}, '_', '${val}');`);
}
