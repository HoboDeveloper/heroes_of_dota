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

            if (decl.kind == ts.SyntaxKind.FunctionDeclaration && (decl.name.escapedText == "active_ability" || decl.name.escapedText == "passive_ability")) {
                const type = checker.getTypeFromTypeNode(call.typeArguments[0]);
                const argument = call.arguments[0];

                if (argument.kind != ts.SyntaxKind.ObjectLiteralExpression) {
                    error_out(argument, "Argument is not an object literal");
                }

                const argument_object = argument as ts.ObjectLiteralExpression;
                const argument_properties = argument_object.properties
                    .map(property => {
                        if (property.kind == ts.SyntaxKind.PropertyAssignment) {
                            return property as ts.PropertyAssignment;
                        } else {
                            error_out(property, `${property.getText()} is not a property assignment in type ${call.typeArguments[0].getText()}`);
                        }
                    });

                const property_assignments = checker.getPropertiesOfType(type)
                    .map(symbol => symbol.valueDeclaration)
                    .map(declaration => {
                        if (declaration.kind == ts.SyntaxKind.PropertySignature) {
                            return declaration as ts.PropertySignature;
                        } else {
                            error_out(declaration, `Not a property declaration in type ${declaration.getText()}`);
                        }
                    })
                    .map(signature => {
                        const type_node = signature.type;
                        const type = checker.getTypeFromTypeNode(type_node);

                        if ((type.getFlags() & ts.TypeFlags.EnumLiteral) != 0) {
                            if (type_node.kind == ts.SyntaxKind.TypeReference) {
                                const reference = type_node as ts.TypeReferenceNode;
                                const reference_name = reference.typeName;

                                if (reference_name.kind == ts.SyntaxKind.QualifiedName) {
                                    const enum_member_symbol = checker.getSymbolAtLocation(reference_name);
                                    const enum_member = enum_member_symbol.valueDeclaration as ts.EnumMember;

                                    if (ts.isNumericLiteral(enum_member.initializer)) {
                                        const literal = ts.createLiteral(parseInt(enum_member.initializer.getText()));

                                        ts.addSyntheticTrailingComment(literal, ts.SyntaxKind.MultiLineCommentTrivia, reference_name.right.getText());

                                        return ts.createPropertyAssignment(signature.name.getText(), literal);
                                    } else if (ts.isPrefixUnaryExpression(enum_member.initializer)) {
                                        if (ts.isNumericLiteral(enum_member.initializer.operand)) {
                                            const literal = ts.createLiteral(parseInt(enum_member.initializer.getText()));

                                            ts.addSyntheticTrailingComment(literal, ts.SyntaxKind.MultiLineCommentTrivia, reference_name.right.getText());

                                            return ts.createPropertyAssignment(signature.name.getText(), literal);
                                        } else {
                                            error_out(enum_member, "Unsupported operand: " + enum_member.initializer.operand.kind);
                                        }
                                    }

                                    error_out(enum_member, "Unsupported initializer kind: " + enum_member.initializer.kind);
                                } else {
                                    error_out(reference, "Unsupported reference kind");
                                }
                            } else {
                                error_out(type_node, "Unsupported type node kind");
                            }
                        }
                    }).filter(node => node != undefined);

                return ts.createObjectLiteral(property_assignments.concat(argument_properties), true);
            }

            return;
        }


        if (node.kind == ts.SyntaxKind.FunctionDeclaration) {
            const declaration = node as ts.FunctionDeclaration;

            const function_name = "ability_definition_to_ability";

            if (declaration.name.escapedText == function_name) {
                const identifier = declaration.parameters[0].name as ts.Identifier;

                // TODO fill all the data + additional data automatically
                const return_statement = ts.createReturn(ts.createObjectLiteral([
                    ts.createPropertyAssignment("id", ts.createPropertyAccess(identifier, "id")),
                    ts.createPropertyAssignment("type", ts.createPropertyAccess(identifier, "type")),
                    ts.createPropertyAssignment("targeting", ts.createPropertyAccess(identifier, "targeting")),
                    ts.createPropertyAssignment("available_since_level", ts.createPropertyAccess(identifier, "available_since_level")),
                    ts.createPropertyAssignment("cooldown", ts.createPropertyAccess(identifier, "cooldown")),
                    ts.createPropertyAssignment("mana_cost", ts.createPropertyAccess(identifier, "mana_cost")),

                    // Specials
                    ts.createPropertyAssignment("damage", ts.createPropertyAccess(identifier, "damage")),

                    // Defaults
                    ts.createPropertyAssignment("cooldown_remaining",   ts.createLiteral(0)),
                ], true));

                const block = ts.createBlock([
                    return_statement
                ], true);

                return ts.createFunctionDeclaration(
                    [],
                    [],
                    undefined,
                    function_name,
                    [],
                    declaration.parameters,
                    declaration.type,
                    block
                );
            }
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