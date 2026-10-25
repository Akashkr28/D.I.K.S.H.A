// Her words, fading up one at a time. With `pace` (seconds between words) a whole line is
// spread across the time she takes to say it. Without it, each word appears as it arrives,
// which suits a streamed reply: words already on screen stay put and only new ones animate.
// Give the component a new `key` for each new line so the animation starts over.
export default function Caption({ text, pace = 0 }: { text: string; pace?: number }) {
  let word = 0
  return (
    <>
      {text.split(/(\s+)/).map((part, index) =>
        /^\s*$/.test(part) ? (
          part
        ) : (
          <span key={index} className="caption-word" style={{ animationDelay: `${word++ * pace}s` }}>
            {part}
          </span>
        ),
      )}
    </>
  )
}
