import {get_all_authorized_players, Player} from "./server";

const player_pending_messages = new Map<number, Chat_Message[]>();

export function pull_pending_chat_messages_for_player(player: Player): Chat_Message[] {
    const pending_messages = player_pending_messages.get(player.id);

    if (!pending_messages) {
        return [];
    }

    return pending_messages.splice(0);
}

export function submit_chat_message(player: Player, message: string) {
    const new_message = {
        from_player_id: player.id,
        from_player_name: player.name,
        message: message
    };

    for (let player of get_all_authorized_players()) {
        let pending_messages = player_pending_messages.get(player.id);

        if (!pending_messages) {
            pending_messages = [];
            player_pending_messages.set(player.id, pending_messages);
        } else if (pending_messages.length > 50) {
            // TODO this will not work in a good way when chat is going too fast,
            // TODO we should rather limit messages by their timestamp, aka if someone
            // TODO is not pulling messages at some reasonable rate then we'll just
            // TODO throw them out
            pending_messages.slice(pending_messages.length - 50);
        }

        pending_messages.push(new_message);
    }
}