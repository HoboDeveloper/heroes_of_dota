import * as ts from "typescript";

export interface Options {
    some?: string;
}

export default function run_transformer(program: ts.Program, options: Options): ts.TransformerFactory<ts.Node> {
    const checker = program.getTypeChecker();

    function error_out(node: ts.Node, error: string) {
        const source = node.getSourceFile();
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
        throw new Error(`ERROR: ${source.fileName}:${line + 1},${character + 1} / ${error}`);
    }

    function process_node(node: ts.Node): ts.Node | undefined {
        if (node.kind == ts.SyntaxKind.CallExpression) {
            const call = node as ts.CallExpression;
            const signature = checker.getResolvedSignature(call);
            const decl = signature.declaration;

            if (!decl) return;

            if (decl.kind == ts.SyntaxKind.FunctionDeclaration && decl.name.escapedText == "enum_to_string") {
                const argument = call.arguments[0];
                const symbol = checker.getSymbolAtLocation(argument);
                const type = checker.getTypeAtLocation(argument);
                const flags = type.getFlags();

                if ((flags & ts.TypeFlags.UnionOrIntersection) != 0) {
                    const inline_function_argument_name = "value";

                    let case_clauses;

                    if ((flags & ts.TypeFlags.EnumLike) != 0) {
                        const enum_decl = type.getSymbol().valueDeclaration as ts.EnumDeclaration;

                        case_clauses = enum_decl.members.map(member => {
                            return ts.createCaseClause(ts.createLiteral(parseInt(member.initializer.getText())), [
                                ts.createReturn(ts.createStringLiteral(member.name.getText()))
                            ]);
                        });
                    } else {
                        const union = type as ts.UnionOrIntersectionType;

                        case_clauses = union.types.map(type => {
                            const value = (type as ts.LiteralType).value;

                            return ts.createCaseClause(ts.createLiteral(value), [
                                ts.createReturn(ts.createStringLiteral(type.getSymbol().getEscapedName().toString()))
                            ]);
                        });

                    }

                    const switch_expression = ts.createSwitch(ts.createIdentifier(inline_function_argument_name), ts.createCaseBlock(case_clauses));
                    const code_block = ts.createBlock([
                        switch_expression
                    ]);

                    const arrow_function = ts.createArrowFunction(
                        undefined,
                        undefined,
                        [
                            ts.createParameter(undefined, undefined, undefined, inline_function_argument_name)
                        ],
                        undefined,
                        undefined,
                        code_block
                    );

                    return ts.createCall(arrow_function, undefined, [argument]);
                } /*else if (ts.isEnumMember(symbol.valueDeclaration)) {
                    return ts.createStringLiteral(symbol.valueDeclaration.name.getText());
                } */else {
                    error_out(argument,"Unsupported argument");
                }
            }

            return;
        }
    }

    function process_source_file(context: ts.TransformationContext, file: ts.SourceFile) {
        console.log("Processing", file.fileName);

        function visitor(node: ts.Node): ts.Node {
            const new_node_or_nothing = process_node(node);

            if (new_node_or_nothing != undefined) {
                return new_node_or_nothing;
            }

            return ts.visitEachChild(node, visitor, context);
        }

        return ts.visitEachChild(file, visitor, context);
    }

    function process_and_update_source_file(context: ts.TransformationContext, file: ts.SourceFile) {
        const updated_node = process_source_file(context, file);

        return ts.updateSourceFileNode(
            file,
            updated_node.statements,
            updated_node.isDeclarationFile,
            updated_node.referencedFiles,
            updated_node.typeReferenceDirectives,
            updated_node.hasNoDefaultLib
        );
    }

    return context => (node: ts.Node) => {
        if (ts.isBundle(node)) {
            const new_files = node.sourceFiles.map(file => process_and_update_source_file(context, file));

            return ts.updateBundle(node, new_files);
        } else if (ts.isSourceFile(node)) {
            return process_and_update_source_file(context, node);
        }

        return node;
    }
}