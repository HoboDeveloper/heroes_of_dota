import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import {LuaLibImportKind, LuaTarget} from "typescript-to-lua";

export interface Options {
    some?: string;
}

export default function run_transformer(program: ts.Program, options: Options): ts.TransformerFactory<ts.Node> {
    const transpiler_options: tstl.CompilerOptions = program.getCompilerOptions();

    transpiler_options.luaTarget = LuaTarget.LuaJIT;
    transpiler_options.luaLibImport = LuaLibImportKind.Require;

    const has_errors =
        program.getGlobalDiagnostics().length > 0 ||
        program.getSyntacticDiagnostics().length > 0 ||
        program.getSemanticDiagnostics().length > 0;

    if (has_errors) {
        console.log("Errors detected, not transpiling");
    }

    const transpiler = new tstl.LuaTranspiler(program);

    function transpile_source_file(file: ts.SourceFile) {
        if (has_errors) return;
        if (file.isDeclarationFile) return;

        console.log("Transpiling", file.fileName);

        transpiler.emitSourceFile(file);
    }

    transpiler.emitLuaLib();

    return context => (node: ts.Node) => {
        if (ts.isBundle(node)) {
            node.sourceFiles.forEach(transpile_source_file);
        } else if (ts.isSourceFile(node)) {
            transpile_source_file(node);
        }

        return ts.createSourceFile("empty", "", ts.ScriptTarget.ES3);
    }
}