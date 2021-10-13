(() => {
    window.modules = {};
    let mod = window.modules;
    mod.babel_parser = require('@babel/parser');
    mod.babel_traverse = require('@babel/traverse');
    mod.babel_generator = require('@babel/generator');
    mod.babel_template = require('@babel/template');
    mod.babel_types = require('@babel/types');
    mod.vm = require('vm');
    mod.util = require('util');
})();