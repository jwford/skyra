import { GuildSettings } from '@lib/types/settings/GuildSettings';
import { UserSettings } from '@lib/types/settings/UserSettings';
import { Moderation } from '@utils/constants';
import { ModerationActionsSendOptions } from '@utils/Security/ModerationActions';
import { Guild, User } from 'discord.js';
import { Task } from 'klasa';

export abstract class ModerationTask extends Task {

	public async run(data: ModerationData) {
		const guild = this.client.guilds.get(data.guildID);
		// If the guild is not available, cancel the task.
		if (typeof guild === 'undefined') return;

		// If the guild is not available, re-schedule the task by creating
		// another with the same data but happening 20 seconds later.
		if (!guild.available) return this.reschedule(data, 20000);

		// Run the abstract handle function.
		try {
			await this.handle(guild, data);
		} catch { /* noop */ }
	}

	protected async reschedule(data: ModerationData, duration: number) {
		await this.client.schedule.create(this.name, Date.now() + duration, {
			data: {
				[Moderation.SchemaKeys.Case]: data.caseID,
				[Moderation.SchemaKeys.Guild]: data.guildID,
				[Moderation.SchemaKeys.User]: data.userID,
				[Moderation.SchemaKeys.Duration]: data.duration,
				scheduleRetryCount: (data.scheduleRetryCount || 0) + 1
			},
			catchUp: true
		});
	}

	protected getTargetDM(guild: Guild, target: User): ModerationActionsSendOptions {
		return {
			moderator: null,
			send: guild.settings.get(GuildSettings.Messages.ModerationDM) && target.settings.get(UserSettings.ModerationDM)
		};
	}

	protected abstract handle(guild: Guild, data: ModerationData): unknown;

}

export interface ModerationData {
	[Moderation.SchemaKeys.Case]: number;
	[Moderation.SchemaKeys.Guild]: string;
	[Moderation.SchemaKeys.User]: string;
	[Moderation.SchemaKeys.Duration]: number;
	scheduleRetryCount?: number;
}
