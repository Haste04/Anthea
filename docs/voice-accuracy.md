# Plant names in voice questions

Anthea sends up to 100 vocabulary hints to Gemini live transcription. Hints
prioritize the conversation's linked plant, then saved plant nicknames and
species, followed by common plant names and terms from the local catalog.
Aster is included even when no plants have been saved. Hints are not species
identifications and do not guarantee recognition.

The server validates and deduplicates hints. The ephemeral token constrains
the session to the same transcription configuration returned to the browser.
See Google's [live vocabulary documentation](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe#custom-vocabulary-biasing).

When a transcript contains an uncertain plant name, Anthea retries the complete
recording through `POST /api/transcribe` with that recording's vocabulary. The
server uses `gemini-3.5-transcribe` with the existing `GEMINI_API_KEY` and
`store: false`. It falls back to local Whisper if the key or provider is
unavailable. The recording request has a 45-second overall limit, including a
12-second provider limit. See Google's [recorded transcription documentation](https://ai.google.dev/gemini-api/docs/transcribe).

If the name remains uncertain, the question stays in the composer. The user can
choose a proposed name, edit the words, send them as heard, or retry transcription.
Suggestions use limited spelling distance in name positions; they never silently
rewrite arbitrary words. Exact known names and generic plant parts send normally.
The retained recording and vocabulary are cleared after sending, cancellation,
or starting a new recording. Browser recognition also passes through this review
check, although its recognition engine does not receive Gemini's hints.

## Measure recognition with your microphone

Automated tests cover transcript handling, vocabulary propagation, ambiguity,
retries, provider failures, and cancellation. They do not measure recognition of
a person's accent or microphone audio.

For a repeatable listening check, save plants called **Aster**, **Aspen**, and a
personal nickname, then test the following in both Talk and Hold to talk modes:

| Spoken sentence | Expected behavior |
| --- | --- |
| Aster | Recognize Aster, or offer a name choice if misheard as asper. |
| My Aster has yellow leaves. | Preserve the name and the complete question. |
| How often should I water my Monstera? | Preserve Monstera. |
| My Aster's leaves are yellow. | Do not flag the possessive as an unknown name. |
| My Aster and my Monstera are dry. | Preserve both names. |
| After watering, check the soil. | Do not substitute Aster for after. |
| My soil is dry. | Do not ask for a plant name. |

Repeat each sentence at least five times with normal speaking volume, then in a
representative noisy room. Record the expected name, raw live caption, final
question, any confirmation shown, and elapsed time. Compare with recordings
from before the change using the same device and conditions.

Report exact name accuracy (correct names / spoken names), incorrect name
substitutions, review frequency, and time until the question is ready. Count
user-confirmed corrections separately from correctly recognized names. A
perfect result on mocked transcripts is not evidence of perfect speech accuracy.
