type FX = {
    to_unit_attach_point(control_point: number, unit: Battle_Unit, attach_point: string): FX;
    to_unit_origin(control_point: number, unit: Battle_Unit): FX;
    to_location(control_point: number, point: XY): FX;
    with_point_value(control_point: number, x?: number, y?: number, z?: number): FX;
    follow_unit_origin(control_point: number, unit: Battle_Unit): FX;
    release(): void;
    destroy_and_release(instant: boolean): void;
}

function fx_by_unit(path: string, unit: Battle_Unit): FX {
    return native_fx(path, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);
}

function fx(path: string): FX {
    return native_fx(path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, GameRules.GetGameModeEntity());
}

function native_fx(path: string, attach: ParticleAttachment_t, handle: CBaseEntity): FX {
    const fx = ParticleManager.CreateParticle(path, attach, handle);

    let invalidated = false;

    function check_particle_validity() {
        if (invalidated) throw "Particle " + fx + " is already destroyed and/or released";
    }

    return {
        to_location(control_point: number, point: XY): FX {
            check_particle_validity();

            ParticleManager.SetParticleControl(fx, control_point, battle_position_to_world_position_center(point));

            return this;
        },
        to_unit_attach_point(control_point: number, unit: Battle_Unit, attach_point: string): FX {
            check_particle_validity();

            ParticleManager.SetParticleControlEnt(fx, control_point, unit.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, attach_point, Vector(), true);

            return this;
        },
        to_unit_origin(control_point: number, unit: Battle_Unit): FX {
            check_particle_validity();

            ParticleManager.SetParticleControl(fx, control_point, unit.handle.GetAbsOrigin());

            return this;
        },
        follow_unit_origin(control_point: number, unit: Battle_Unit): FX {
            check_particle_validity();

            ParticleManager.SetParticleControlEnt(fx, control_point, unit.handle, ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, undefined, Vector(), true);

            return this;
        },
        with_point_value(control_point: number, x?: number, y?: number, z?: number): FX {
            check_particle_validity();

            ParticleManager.SetParticleControl(fx, control_point, Vector(x, y, z));

            return this;
        },
        destroy_and_release(instant: boolean): void {
            check_particle_validity();

            ParticleManager.DestroyParticle(fx, instant);
            ParticleManager.ReleaseParticleIndex(fx);

            invalidated = true;
        },
        release(): void {
            check_particle_validity();

            ParticleManager.ReleaseParticleIndex(fx);

            invalidated = true;
        }
    };
}