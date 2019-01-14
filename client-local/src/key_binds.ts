type Registered_Command = {
    callback: () => void;
    key_bind: string;
}

interface Command_Storage extends Panel {
    registered_commands: { [key: string]:Registered_Command };

    register_key_bind(key_bind_name: string, callback: () => void): void;
}

const command_storage = $.GetContextPanel() as Command_Storage;

if (!command_storage.registered_commands) {
    command_storage.registered_commands = {};
}

interface Custom_UI_Config {
    register_key_bind(key_bind_name: string, callback: () => void): void;

    [key: string]: any;
}

interface CDOTA_PanoramaScript_GameUI {
    CustomUIConfig(): Custom_UI_Config
}

declare var GameUI: CDOTA_PanoramaScript_GameUI;

GameUI.CustomUIConfig().register_key_bind = (key_bind_name: string, callback: () => void) => {
    const command = command_storage.registered_commands[key_bind_name];

    if (!command) {
        const key_bind = get_key_bind(key_bind_name);

        command_storage.registered_commands[key_bind_name] = {
            key_bind: key_bind,
            callback: callback
        };

        const command_name = `Custom_Key_Bind_${key_bind}`;

        Game.CreateCustomKeyBind(key_bind, command_name);
        Game.AddCommand(command_name, () => {
            command_storage.registered_commands[key_bind_name].callback();
        }, "", 0);

        $.Msg(`Registering command for ${key_bind}`);
    } else {
        command.callback = callback;

        $.Msg(`Re-registering command for ${command.key_bind}`);
    }
};

function get_key_bind(name: string) {
    const context_panel = $.GetContextPanel();
    context_panel.BCreateChildren(`<DOTAHotkey keybind="${name}" />`);

    const key_element = context_panel.GetChild(context_panel.GetChildCount() - 1);
    key_element.DeleteAsync(0);

    return (key_element.GetChild(0) as LabelPanel).text;
}
