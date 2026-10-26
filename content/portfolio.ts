// Everything D.I.K.S.H.A is allowed to say about Akash, and everything the page shows.
//
// DRAFT: written from notes, not yet checked by Akash. Before the site goes public,
// read every line and fix anything wrong. Contact details were added by Akash on 26 Oct.
// She answers visitors only from this file, so what's here is what recruiters hear.

export const profile = {
  name: 'Akash',
  role: 'Full-stack developer building AI products',
  summary:
    'Akash is a full-stack developer who works in JavaScript, React, Node.js and Python. He is studying for an MCA with a specialisation in AI and machine learning, and builds practical projects that put AI to work inside real applications.',
  location: 'India',
  education: 'MCA (AI and Machine Learning), Amity University Online',
  interests: ['AI and LLM security', 'prompt engineering', 'developer tooling', 'technical writing for beginners'],
  skills: {
    Frontend: ['React', 'Next.js', 'TypeScript', 'JavaScript'],
    Backend: ['Node.js', 'Express', 'PostgreSQL', 'Prisma', 'Redis', 'WebSockets'],
    AI: ['Claude API', 'prompt design', 'streaming chat', 'vision input', 'text to speech'],
    Other: ['Python', 'OAuth 2.0', 'Git'],
  },
  // leave a field empty to hide it on the page
  email: 'akashkumarsingh816@gmail.com',
  phone: '+91 88253 30731',
  links: {
    github: 'https://github.com/Akashkr28',
    linkedin: 'https://www.linkedin.com/in/akash-kumar-singh-2a3503364/',
    hashnode: '',
  },
}

export type Project = {
  id: string
  name: string
  tagline: string
  description: string
  stack: string[]
  link?: string // live demo
  repo?: string // source code
  published: boolean // false keeps it off the page and out of her answers
}

export const projects: Project[] = [
  {
    id: 'diksha',
    name: 'D.I.K.S.H.A',
    tagline: 'The voice AI guiding this site',
    description:
      'A voice assistant built from scratch. She listens, thinks with Claude, speaks with a natural voice, and answers questions about Akash using only verified information. A private version also remembers conversations and can see through a camera.',
    stack: ['Next.js', 'TypeScript', 'Claude API', 'ElevenLabs', 'Web Speech API', 'Three.js'],
    published: true,
  },
  {
    id: 'checkgrid',
    name: 'CheckGrid',
    tagline: 'One million checkboxes, shared live',
    description:
      'A real-time collaborative grid of one million checkboxes that many people can tick at once. State is stored compactly in a Redis bitfield and changes are broadcast to everyone over WebSockets. Sign-in uses OAuth 2.0 with Google and GitHub.',
    stack: ['Node.js', 'Express', 'WebSockets', 'Redis', 'OAuth 2.0'],
    published: true,
  },
  {
    id: 'billing',
    name: 'Travel billing tool',
    tagline: 'Invoices with an AI second pair of eyes',
    description:
      'An internal invoicing app for a tour and travel company. Staff generate invoices, and AI drafts trip summaries, suggests charges, and flags amounts that look unusual.',
    stack: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Prisma', 'Redis'],
    published: true,
  },
  {
    id: 'sentinel',
    name: 'SENTINEL',
    tagline: 'Prompt injection attack and defence demo',
    description:
      'A platform that demonstrates prompt injection attacks against LLM apps and the defences that stop them.',
    stack: ['Claude API'],
    published: false, // turn on once it's built and the description is accurate
  },
  {
    id: 'processiq',
    name: 'ProcessIQ',
    tagline: 'AI research engine for business processes',
    description: 'An AI research and intelligence engine built for an enterprise AI build challenge.',
    stack: ['Node.js', 'Express', 'React', 'SQLite'],
    published: false, // turn on once the details are confirmed
  },
]

export const publishedProjects = projects.filter((project) => project.published)

// Her spoken introduction, recorded once and replayed for every visitor. It starts on its own
// when the page loads; until the visitor taps, the lines show as captions without sound.
// "show" reveals that project's card as she reaches the line.
// Her name is spelled "Diksha" here so the voice pronounces it as a word.
export const intro: { text: string; show?: string }[] = [
  { text: "Hi, I'm Diksha, the AI Akash built to show you around." },
  {
    text: "Akash is a full-stack developer. He works in JavaScript, React, Node and Python, and he's doing a master's in computer applications, specialising in AI.",
  },
  {
    text: 'He built CheckGrid, a grid of one million checkboxes that many people can tick at the same time, live, using WebSockets and Redis.',
    show: 'checkgrid',
  },
  {
    text: 'He also built a billing tool for a travel company, where AI drafts trip summaries and flags unusual charges.',
    show: 'billing',
  },
  { text: 'And he built me. I can listen, talk, and answer your questions about his work.', show: 'diksha' },
  { text: 'So, what would you like to know about him?' },
]

// one-click questions offered after the introduction
export const suggestions = ['What is his best project?', 'What AI work has he done?', 'How were you built?', 'How can I contact him?']
