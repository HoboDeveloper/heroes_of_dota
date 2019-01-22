import * as ts from "typescript";
import * as tstl from "typescript-to-lua";
import * as path from "path";
import * as fs from "fs";
import {LuaLibImportKind} from "typescript-to-lua";

export interface Options {
    some?: string;
}

export default function run_transformer(program: ts.Program, options: Options): ts.TransformerFactory<ts.Node> {
    const transpiler_options: tstl.CompilerOptions = program.getCompilerOptions();

    transpiler_options.luaTarget = "JIT";
    transpiler_options.luaLibImport = "require";

    const type_checker = program.getTypeChecker();
    const has_errors =
        program.getGlobalDiagnostics().length > 0 ||
        program.getSyntacticDiagnostics().length > 0 ||
        program.getSemanticDiagnostics().length > 0;

    if (has_errors) {
        console.log("Errors detected, not transpiling");
    }

    function transpile_source_file(file: ts.SourceFile) {
        if (has_errors) return;
        if (file.isDeclarationFile) return;

        console.log("Transpiling", file.fileName);

        const lua = tstl.createTranspiler(type_checker, transpiler_options, file).transpileSourceFile();

        const root_dir = transpiler_options.rootDir;
        let out_path = file.fileName;
        if (transpiler_options.outDir != transpiler_options.rootDir) {
            const relative_source_path = path.resolve(file.fileName).replace(path.resolve(root_dir), "");
            out_path = path.join(transpiler_options.outDir, relative_source_path);
        }

        if (transpiler_options.outFile) {
            if (path.isAbsolute(transpiler_options.outFile)) {
                out_path = transpiler_options.outFile;
            } else {
                out_path = path.resolve(transpiler_options.outDir, transpiler_options.outFile);
            }
        } else {
            const lua_file_name = path.basename(out_path, path.extname(out_path)) + ".lua";
            out_path = path.join(path.dirname(out_path), lua_file_name);
        }

        ts.sys.writeFile(out_path, lua);
    }

    if (transpiler_options.luaLibImport === LuaLibImportKind.Require || transpiler_options.luaLibImport === LuaLibImportKind.Always) {
        fs.copyFileSync(
            path.resolve(__dirname, "../node_modules/typescript-to-lua/dist/lualib/lualib_bundle.lua"),
            path.join(transpiler_options.outDir, "lualib_bundle.lua")
        );
    }

    return context => (node: ts.Node) => {
        if (ts.isBundle(node)) {
            node.sourceFiles.forEach(transpile_source_file);
        } else if (ts.isSourceFile(node)) {
            transpile_source_file(node);
        }

        return ts.createSourceFile("empty", "", ts.ScriptTarget.ES3);
    }
}