// tina/config.ts
import { defineConfig } from "tinacms";
var branch = process.env.TINA_PUBLIC_BRANCH || process.env.HEAD || "main";
var imageFields = [
  {
    type: "image",
    name: "src",
    label: "Image"
  },
  {
    type: "string",
    name: "alt",
    label: "Alt text",
    ui: {
      component: "textarea"
    }
  },
  {
    type: "string",
    name: "caption",
    label: "Caption"
  }
];
var linkFields = [
  {
    type: "string",
    name: "text",
    label: "Linked text"
  },
  {
    type: "string",
    name: "href",
    label: "URL"
  }
];
var config_default = defineConfig({
  branch,
  clientId: process.env.TINA_PUBLIC_CLIENT_ID || "",
  token: process.env.TINA_TOKEN || "",
  build: {
    publicFolder: "public",
    outputFolder: "admin"
  },
  media: {
    tina: {
      publicFolder: "public",
      mediaRoot: "blog"
    }
  },
  schema: {
    collections: [
      {
        name: "blogPost",
        label: "Blog Posts",
        path: "content/blog",
        format: "json",
        ui: {
          filename: {
            readonly: true,
            slugify: (values) => values?.slug || values?.title || "untitled-post"
          },
          router: ({ document }) => `/blog/${document._sys.filename}`
        },
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title"
          },
          {
            type: "string",
            name: "slug",
            label: "Slug",
            description: "Use lowercase words and hyphens. This becomes /blog/your-slug."
          },
          {
            type: "string",
            name: "excerpt",
            label: "Excerpt",
            description: "Short public summary. Also used when no preview copy is shown.",
            ui: {
              component: "textarea"
            }
          },
          {
            type: "datetime",
            name: "publishedAt",
            label: "Published date"
          },
          {
            type: "datetime",
            name: "updatedAt",
            label: "Updated date"
          },
          {
            type: "string",
            name: "status",
            label: "Status",
            options: ["draft", "published"]
          },
          {
            type: "boolean",
            name: "featured",
            label: "Featured"
          },
          {
            type: "boolean",
            name: "noindex",
            label: "Noindex",
            description: "Keep enabled for posts that should not appear in search engines."
          },
          {
            type: "number",
            name: "readTimeMinutes",
            label: "Read time in minutes"
          },
          {
            type: "string",
            name: "audience",
            label: "Audience",
            options: ["Founders", "Testers", "Everyone"]
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true
          },
          {
            type: "string",
            name: "seoTitle",
            label: "SEO title",
            description: "Recommended: about 50-60 characters."
          },
          {
            type: "string",
            name: "metaDescription",
            label: "Meta description",
            description: "Recommended: about 140-160 characters, written for humans.",
            ui: {
              component: "textarea"
            }
          },
          {
            type: "string",
            name: "canonicalPath",
            label: "Canonical path",
            description: "Example: /blog/top-5-free-user-testing-platforms-2026"
          },
          {
            type: "object",
            name: "ogImage",
            label: "Open Graph image",
            fields: imageFields
          },
          {
            type: "object",
            name: "previewImage",
            label: "Blog preview image",
            fields: imageFields
          },
          {
            type: "object",
            name: "coverImage",
            label: "Article cover image",
            fields: imageFields
          },
          {
            type: "object",
            name: "body",
            label: "Article body",
            list: true,
            templates: [
              {
                name: "paragraph",
                label: "Paragraph",
                fields: [
                  {
                    type: "string",
                    name: "text",
                    label: "Text",
                    ui: {
                      component: "textarea"
                    }
                  },
                  {
                    type: "object",
                    name: "links",
                    label: "Inline links",
                    list: true,
                    fields: linkFields
                  }
                ]
              },
              {
                name: "heading",
                label: "Heading",
                fields: [
                  {
                    type: "number",
                    name: "level",
                    label: "Heading level"
                  },
                  {
                    type: "string",
                    name: "text",
                    label: "Text"
                  }
                ]
              },
              {
                name: "image",
                label: "Image",
                fields: [
                  {
                    type: "object",
                    name: "image",
                    label: "Image",
                    fields: imageFields
                  }
                ]
              },
              {
                name: "list",
                label: "List",
                fields: [
                  {
                    type: "string",
                    name: "items",
                    label: "Items",
                    list: true,
                    ui: {
                      component: "textarea"
                    }
                  }
                ]
              },
              {
                name: "quote",
                label: "Quote",
                fields: [
                  {
                    type: "string",
                    name: "text",
                    label: "Text",
                    ui: {
                      component: "textarea"
                    }
                  },
                  {
                    type: "string",
                    name: "attribution",
                    label: "Attribution"
                  }
                ]
              },
              {
                name: "callout",
                label: "Callout",
                fields: [
                  {
                    type: "string",
                    name: "title",
                    label: "Title"
                  },
                  {
                    type: "string",
                    name: "text",
                    label: "Text",
                    ui: {
                      component: "textarea"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
