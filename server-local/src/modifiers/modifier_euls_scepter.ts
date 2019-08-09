class Modifier_Euls_Scepter extends CDOTA_Modifier_Lua {
    initial_forward: Vector;

    OnCreated(): void {
        if (IsServer()) {
            this.initial_forward = this.GetParent().GetForwardVector();

            this.StartIntervalThink(0);
        }
    }

    OnIntervalThink(): void {
        const parent = this.GetParent();
        const position = parent.GetAbsOrigin();
        const ground = GetGroundHeight(position, undefined);
        const current_angle = (GameRules.GetGameTime() * 16.0) % (Math.PI * 2);
        const target_height = 400;
        const delta_time = Math.min(this.GetElapsedTime() / 1.5, 1);
        const current_height = Math.sin(delta_time * (Math.PI / 2)) * target_height;
        parent.SetForwardVector(Vector(Math.cos(current_angle), Math.sin(current_angle)));
        parent.SetAbsOrigin(Vector(position.x, position.y, ground + current_height));
    }

    OnDestroy(): void {
        if (IsServer()) {
            this.GetParent().SetForwardVector(this.initial_forward);
        }
    }

    GetEffectName(): string {
        return "particles/euls_scepter/cyclone.vpcf";
    }

    GetEffectAttachType(): ParticleAttachment_t {
        return ParticleAttachment_t.PATTACH_ABSORIGIN;
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Euls_Scepter = Modifier_Euls_Scepter.prototype;