const { Command, MessageEmbed, util: { fetch } } = require('../../index');

module.exports = class extends Command {

	constructor(...args) {
		super(...args, {
			aliases: ['chucknorris'],
			requiredPermissions: ['EMBED_LINKS'],
			cooldown: 10,
			description: (msg) => msg.language.get('COMMAND_NORRIS_DESCRIPTION'),
			extendedHelp: (msg) => msg.language.get('COMMAND_NORRIS_EXTENDED')
		});
		this.spam = true;
	}

	async run(msg) {
		const data = await fetch('https://api.chucknorris.io/jokes/random', 'json');
		const embed = new MessageEmbed()
			.setColor(0x80D8FF)
			.setTitle(msg.language.get('COMMAND_NORRIS_OUTPUT'))
			.setURL(data.url)
			.setThumbnail(data.icon_url)
			.setDescription(data.value);

		return msg.sendEmbed(embed);
	}

};