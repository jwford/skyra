import { SkyraCommand } from '@lib/structures/SkyraCommand';
import { PermissionLevels } from '@lib/types/Enums';
import { GuildSettings } from '@lib/types/settings/GuildSettings';
import { TextChannel } from 'discord.js';
import { CommandStore, KlasaMessage } from 'klasa';

export default class extends SkyraCommand {

	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			bucket: 2,
			cooldown: 10,
			description: language => language.tget('COMMAND_SETIMAGELOGS_DESCRIPTION'),
			extendedHelp: language => language.tget('COMMAND_SETIMAGELOGS_EXTENDED'),
			permissionLevel: PermissionLevels.Administrator,
			runIn: ['text'],
			usage: '<here|channel:channelname>'
		});
	}

	public async run(message: KlasaMessage, [channel]: [TextChannel | 'here']) {
		if (channel === 'here') channel = message.channel as TextChannel;
		else if (channel.type !== 'text') throw message.language.tget('CONFIGURATION_TEXTCHANNEL_REQUIRED');

		const current = message.guild!.settings.get(GuildSettings.Channels.ImageLogs);
		if (current === channel.id) throw message.language.tget('CONFIGURATION_EQUALS');
		await message.guild!.settings.update(GuildSettings.Channels.ImageLogs, channel, {
			extraContext: { author: message.author.id }
		});
		return message.sendLocale('COMMAND_SETIMAGELOGS_SET', [channel]);
	}

}
