import { Fragment } from 'react'
import Image from 'next/image'
import Guide from '../components/Guide'
import Cursor from '../components/Cursor'
import ProjectVisual from '../components/ProjectVisual'
import ScrollFX, { LocalTime } from '../components/ScrollFX'
import { profile, publishedProjects } from '@/content/portfolio'

// The public portfolio. D.I.K.S.H.A greets visitors at the top; everything she can say
// is also here as plain text below, for people in a hurry and for search engines.

// splits a headline into words that rise into place one after another
function words(text: string) {
  // the space sits between the word boxes; inside one it would collapse
  return text.split(' ').map((word, index) => (
    <Fragment key={index}>
      <span className="word">
        <span style={{ ['--i' as string]: index }}>{word}</span>
      </span>{' '}
    </Fragment>
  ))
}

function Label({ index, title }: { index: string; title: string }) {
  return (
    <div className="sec-label" data-reveal>
      <span>[{index}]</span>
      <i />
      <span>{title}</span>
    </div>
  )
}

// how a spoken question travels through her, in order
const PIPELINE = [
  { name: 'You speak', detail: 'Speech recognition turns your words into text, or you type' },
  { name: 'Claude thinks', detail: 'The reply streams back as it is written, from verified facts only' },
  { name: 'Sentence by sentence', detail: 'Each finished sentence goes to her voice straight away' },
  { name: 'ElevenLabs speaks', detail: 'A natural voice, so she starts talking before the answer is done' },
  { name: 'She moves', detail: 'The WebGL presence follows the measured loudness of her voice' },
]

const FACTS = [
  "Her replies come from Anthropic's Claude, streamed to the page as they are written.",
  'She speaks each sentence as soon as it is complete, so she starts talking before the full answer exists.',
  'Her introduction is recorded once and replayed, so it starts instantly for every visitor.',
  "She answers only from a fixed set of facts about Akash, and says so when she doesn't know something.",
  'Her instructions tell her to refuse attempts to change her role, and every visitor is rate limited.',
  'Her presence is a WebGL scene built from custom shaders, and it moves with the measured loudness of her voice.',
]

export default function Home() {
  const links = [
    profile.email && { label: profile.email, href: `mailto:${profile.email}` },
    profile.links.github && { label: 'GitHub', href: profile.links.github },
    profile.links.linkedin && { label: 'LinkedIn', href: profile.links.linkedin },
    profile.links.hashnode && { label: 'Blog', href: profile.links.hashnode },
  ].filter((link): link is { label: string; href: string } => !!link)
  const skills = Object.values(profile.skills).flat()

  return (
    <main className="site" id="top">
      <Cursor />
      <ScrollFX />
      <Guide />

      <section className="sec" id="about">
        <Label index="01" title="About" />
        <h2 className="display display-xl" data-reveal="words">
          {words(profile.role)}
        </h2>
        <div className="about-grid">
          <figure className="portrait" data-reveal>
            <div className="portrait-frame">
              <Image
                src="/akash.webp"
                alt={`${profile.name}, standing in a light blue blazer`}
                width={1086}
                height={1448}
                sizes="(max-width: 900px) 90vw, 32vw"
              />
              <span className="portrait-scan" aria-hidden="true" />
            </div>
            <figcaption>
              <span>{profile.name}</span>
              <span>{profile.location}</span>
            </figcaption>
          </figure>
          <div className="about-text">
            <p className="lead" data-reveal>
              {profile.summary}
            </p>
            <dl className="meta" data-reveal>
              <div>
                <dt>Education</dt>
                <dd>{profile.education}</dd>
              </div>
              <div>
                <dt>Based in</dt>
                <dd>{profile.location}</dd>
              </div>
              <div>
                <dt>Interests</dt>
                <dd>{profile.interests.join(', ')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* every skill, sliding past in two directions */}
      <div className="marquee" aria-hidden="true">
        {[0, 1].map((row) => (
          <div key={row} className={`marquee-row${row ? ' is-reverse' : ''}`}>
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee-track">
                {(row ? [...skills].reverse() : skills).map((skill, index) => (
                  <span key={skill} className={index % 2 ? 'is-outline' : ''}>
                    {skill}
                    <i />
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <section className="sec" id="projects">
        <Label index="02" title="Selected work" />
        <div className="works">
          {publishedProjects.map((project, index) => {
            const href = project.link || project.repo
            return (
              <article key={project.id} id={`project-${project.id}`} className="work" data-reveal>
                <div className="work-text">
                  <div className="work-index">{String(index + 1).padStart(2, '0')}</div>
                  <h3 className="display work-name">{project.name}</h3>
                  <p className="work-tagline">{project.tagline}</p>
                  <p className="work-desc">{project.description}</p>
                  <ul className="work-stack">
                    {project.stack.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {(project.link || project.repo) && (
                    <p className="work-links">
                      {project.link && <a href={project.link}>Live demo ↗</a>}
                      {project.repo && <a href={project.repo}>Source code ↗</a>}
                    </p>
                  )}
                </div>
                {href ? (
                  <a href={href} className="work-visual" data-cursor="View" aria-label={`Open ${project.name}`}>
                    <ProjectVisual id={project.id} />
                  </a>
                ) : (
                  <div className="work-visual">
                    <ProjectVisual id={project.id} />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="sec" id="skills">
        <Label index="03" title="Capabilities" />
        <div className="skills">
          {Object.entries(profile.skills).map(([area, items]) => (
            <div key={area} className="skill" data-reveal>
              <h3>{area}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" id="how">
        <Label index="04" title="Under the hood" />
        <h2 className="display display-l" data-reveal="words">
          {words('How D.I.K.S.H.A works')}
        </h2>
        <ol className="pipeline" data-reveal>
          {PIPELINE.map((step, index) => (
            <li key={step.name} style={{ ['--i' as string]: index }}>
              <span className="pipeline-node" />
              <b>{step.name}</b>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
        <ul className="facts">
          {FACTS.map((fact, index) => (
            <li key={fact} data-reveal>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {fact}
            </li>
          ))}
        </ul>
      </section>

      <section className="sec sec-contact" id="contact">
        <Label index="05" title="Contact" />
        <h2 className="display display-xxl" data-reveal="words">
          {words("Let's talk.")}
        </h2>
        <div className="contact-row" data-reveal>
          {profile.email ? (
            <a className="orb-button" href={`mailto:${profile.email}`} data-magnetic>
              Email Akash
            </a>
          ) : (
            <a className="orb-button" href="#top" data-magnetic>
              Ask D.I.K.S.H.A
            </a>
          )}
          <div className="contact-links">
            {links.length > 0 ? (
              links.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label} ↗
                </a>
              ))
            ) : (
              <p>Contact details are coming soon. Until then, D.I.K.S.H.A can tell you about his work.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>© {new Date().getFullYear()} Akash</span>
        <span>Built with Next.js, Three.js, Claude and ElevenLabs · Voice by ElevenLabs</span>
        <span>
          India · <LocalTime />
        </span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  )
}
