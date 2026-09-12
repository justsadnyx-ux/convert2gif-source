const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = '<YOUR_APPLICATION_ID>';
const API = 'https://discord.com/api/v10';

const commands = [
  {
    name: 'gif',
    description: 'Turn an image into a real static GIF file (images only).',
    options: [
      {
        type: 11,
        name: 'file',
        description: 'The image to convert',
        required: false,
      },
      {
        type: 3,
        name: 'url',
        description: 'Convert an image hosted at a direct URL',
        required: false,
      },
    ],
  },
  {
    name: 'imginfo',
    description: 'Show an image type, dimensions, and size.',
    options: [
      {
        type: 11,
        name: 'file',
        description: 'The image to inspect',
        required: false,
      },
      {
        type: 3,
        name: 'url',
        description: 'Or inspect an image at a direct URL',
        required: false,
      },
    ],
  },
  {
    name: 'help',
    description: 'Show all Convert2GIF commands and usage.',
  },
  {
    name: 'ping',
    description: 'Check bot gateway latency.',
  },
  {
    name: 'avatar',
    description: 'Show your avatar, or another user\'s avatar.',
    options: [
      {
        type: 6,
        name: 'user',
        description: 'Whose avatar to show (defaults to you)',
        required: false,
      },
    ],
  },
  {
    name: 'uptime',
    description: 'Show how long the bot has been running.',
  },
  {
    name: 'stats',
    description: 'Show live conversion stats and server count.',
  },
  {
    name: 'invite',
    description: 'Get the invite link for Convert2GIF.',
  },
  {
    name: 'top',
    description: 'Leaderboard of top GIF converters in the server.',
  },
  {
    name: 'about',
    description: 'About Convert2GIF — open source, owner, and links.',
  },
  {
    name: 'userinfo',
    description: 'Show member info — join date, roles, and more.',
    options: [
      {
        type: 6,
        name: 'user',
        description: 'Whose info to show (defaults to you)',
        required: false,
      },
    ],
  },
  {
    name: 'serverinfo',
    description: 'Show info about this server.',
  },
  {
    name: '8ball',
    description: 'Ask the magic 8-ball a question.',
    options: [
      {
        type: 3,
        name: 'question',
        description: 'Your question for the 8-ball',
        required: true,
      },
    ],
  },
  {
    name: 'announce',
    description: '[Owner] Post an announcement to the info channel.',
    options: [
      {
        type: 3,
        name: 'text',
        description: 'Announcement text (@everyone / @here supported)',
        required: true,
      },
    ],
  },
  {
    name: 'poll',
    description: '[Owner] Start a reaction poll in the info channel.',
    options: [
      {
        type: 3,
        name: 'question',
        description: 'The poll question',
        required: true,
      },
      {
        type: 3,
        name: 'first',
        description: 'First answer option',
        required: true,
      },
      {
        type: 3,
        name: 'second',
        description: 'Second answer option',
        required: true,
      },
      {
        type: 3,
        name: 'third',
        description: 'Third answer option (optional)',
        required: false,
      },
      {
        type: 3,
        name: 'fourth',
        description: 'Fourth answer option (optional)',
        required: false,
      },
      {
        type: 3,
        name: 'fifth',
        description: 'Fifth answer option (optional)',
        required: false,
      },
    ],
  },
  {
    name: 'testnsfw',
    description: '[Owner] Test the NSFW AI filter on an image URL or attachment.',
    options: [
      {
        type: 3,
        name: 'url',
        description: 'Direct URL of an image to test',
        required: false,
      },
      {
        type: 11,
        name: 'file',
        description: 'Or attach an image to test',
        required: false,
      },
    ],
  },
];

if (!TOKEN) {
  console.error('Set BOT_TOKEN env var.');
  process.exit(1);
}

const res = await fetch(`${API}/applications/${CLIENT_ID}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`FAIL ${res.status}: ${body}`);
  process.exit(1);
}

const created = await res.json();
console.log(`Registered ${created.length} global commands:`);
created.forEach((c) => console.log(`  /${c.name} (id ${c.id})`));