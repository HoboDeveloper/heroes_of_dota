const enum Activity_Translation {
    ti8 = "ti8"
}

const translations = enum_values<Activity_Translation>();
const translation_to_index: Record<string, number> = {};

for (let index = 0; index < translations.length; index++) {
    translation_to_index[translations[index]] = index;
}

type Modifier_Activity_Translation_Params = {
    translation: Activity_Translation
    duration: number
}

class Modifier_Activity_Translation extends CDOTA_Modifier_Lua {
    OnCreated(params: table): void {
        if (IsServer()) {
            const parameters = params as Modifier_Activity_Translation_Params;

            this.SetStackCount(translation_to_index[parameters.translation]);
        }
    }

    DeclareFunctions(): modifierfunction[] {
        return [ modifierfunction.MODIFIER_PROPERTY_TRANSLATE_ACTIVITY_MODIFIERS ];
    }

    GetActivityTranslationModifiers(): string {
        return translations[this.GetStackCount()];
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Activity_Translation = Modifier_Activity_Translation.prototype;