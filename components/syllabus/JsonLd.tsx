/**
 * Renders a JSON-LD block for rich results.
 *
 * `JSON.stringify` is escaped before it reaches the DOM so a syllabus string
 * containing `<` (or `</script>`) can never break out of the tag. The syllabus
 * JSON is trusted, but the escaping keeps the component safe if the data source
 * ever changes. Same approach as the question pages' JSON-LD.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The payload is JSON, not user HTML; escaping `<` makes it inert.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
