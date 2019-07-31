import * as ts from "typescript";
import {
    SimpleType,
    SimpleTypeKind,
    SimpleTypeMemberNamed,
    SimpleTypeObject,
    toSimpleType
} from "ts-simple-type";

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
        function copy_object(expression: ts.Expression, type: SimpleTypeObject) {
            return ts.createObjectLiteral(type.members.map(member => ts.createPropertyAssignment(member.name, ts.createPropertyAccess(expression, member.name))), true)
        }

        function resolve_alias(type: SimpleType): SimpleType {
            return type.kind == SimpleTypeKind.ALIAS ? type.target : type;
        }

        function extract_members(types: SimpleType[]): SimpleTypeMemberNamed[]{
            const result: SimpleTypeMemberNamed[] = [];

            for (const child of types) {
                const resolved = resolve_alias(child);

                if (resolved.kind == SimpleTypeKind.OBJECT) {
                    resolved.members.forEach(member => result.push(member));
                } else if (resolved.kind == SimpleTypeKind.INTERSECTION || resolved.kind == SimpleTypeKind.UNION) {
                    result.push(...extract_members(resolved.types));
                } else {
                    console.log("Can't extract from", resolved);
                }
            }

            return result;
        }

        if (node.kind == ts.SyntaxKind.CallExpression) {
            const call = node as ts.CallExpression;
            const signature = checker.getResolvedSignature(call);
            const decl = signature.declaration;

            if (!decl) return;

            if (decl.kind == ts.SyntaxKind.FunctionDeclaration && decl.name.escapedText == "copy") {
                const argument = call.arguments[0];
                const type = resolve_alias(toSimpleType(checker.getTypeAtLocation(argument), checker));

                if (type.kind == SimpleTypeKind.UNION || type.kind == SimpleTypeKind.INTERSECTION) {
                    const set: Record<string, undefined> = {};

                    extract_members(type.types).map(member => member.name).forEach(name => set[name] = undefined);

                    const member_names = Object.keys(set);

                    return ts.createObjectLiteral(member_names.map(name => ts.createPropertyAssignment(name, ts.createPropertyAccess(argument, name))), true)
                }

                if (type.kind == SimpleTypeKind.OBJECT) {
                    return copy_object(argument, type);
                }

                error_out(argument, "Unsupported argument type " + type.kind);
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