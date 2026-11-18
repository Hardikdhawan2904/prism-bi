import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="text-base font-semibold" {...props} />,
          h2: (props) => <h2 className="text-base font-semibold" {...props} />,
          h3: (props) => <h3 className="text-sm font-semibold" {...props} />,
          p: (props) => <p {...props} />,
          strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
          ul: (props) => <ul className="list-inside list-disc pl-1" {...props} />,
          ol: (props) => <ol className="list-inside list-decimal pl-1" {...props} />,
          li: (props) => <li {...props} />,
          a: (props) => (
            <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
          ),
          code: (props) => <code className="rounded-sm bg-foreground/10 px-1 py-0.5 text-xs" {...props} />,
          pre: (props) => (
            <pre className="overflow-x-auto rounded-md bg-foreground/10 p-3 text-xs" {...props} />
          ),
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...props} />
            </div>
          ),
          th: (props) => <th className="border-b border-border px-2 py-1 text-left font-medium" {...props} />,
          td: (props) => <td className="border-b border-border/50 px-2 py-1" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
