export function gql(strings, ...args) {
  let str = "";
  strings.forEach((string, i) => {
    str += string + (args[i] || "");
  });
  return str;
}
export const BlogPostPartsFragmentDoc = gql`
    fragment BlogPostParts on BlogPost {
  __typename
  title
  slug
  excerpt
  publishedAt
  updatedAt
  status
  featured
  noindex
  readTimeMinutes
  audience
  tags
  seoTitle
  metaDescription
  canonicalPath
  ogImage {
    __typename
    src
    alt
    caption
  }
  previewImage {
    __typename
    src
    alt
    caption
  }
  coverImage {
    __typename
    src
    alt
    caption
  }
  body {
    __typename
    ... on BlogPostBodyParagraph {
      text
      links {
        __typename
        text
        href
      }
    }
    ... on BlogPostBodyHeading {
      level
      text
    }
    ... on BlogPostBodyImage {
      image {
        __typename
        src
        alt
        caption
      }
    }
    ... on BlogPostBodyList {
      items
    }
    ... on BlogPostBodyQuote {
      text
      attribution
    }
    ... on BlogPostBodyCallout {
      title
      text
    }
  }
}
    `;
export const BlogPostDocument = gql`
    query blogPost($relativePath: String!) {
  blogPost(relativePath: $relativePath) {
    ... on Document {
      _sys {
        filename
        basename
        hasReferences
        breadcrumbs
        path
        relativePath
        extension
      }
      id
    }
    ...BlogPostParts
  }
}
    ${BlogPostPartsFragmentDoc}`;
export const BlogPostConnectionDocument = gql`
    query blogPostConnection($before: String, $after: String, $first: Float, $last: Float, $sort: String, $filter: BlogPostFilter) {
  blogPostConnection(
    before: $before
    after: $after
    first: $first
    last: $last
    sort: $sort
    filter: $filter
  ) {
    pageInfo {
      hasPreviousPage
      hasNextPage
      startCursor
      endCursor
    }
    totalCount
    edges {
      cursor
      node {
        ... on Document {
          _sys {
            filename
            basename
            hasReferences
            breadcrumbs
            path
            relativePath
            extension
          }
          id
        }
        ...BlogPostParts
      }
    }
  }
}
    ${BlogPostPartsFragmentDoc}`;
export function getSdk(requester) {
  return {
    blogPost(variables, options) {
      return requester(BlogPostDocument, variables, options);
    },
    blogPostConnection(variables, options) {
      return requester(BlogPostConnectionDocument, variables, options);
    }
  };
}
import { createClient } from "tinacms/dist/client";
const generateRequester = (client) => {
  const requester = async (doc, vars, options) => {
    let url = client.apiUrl;
    if (options?.branch) {
      const index = client.apiUrl.lastIndexOf("/");
      url = client.apiUrl.substring(0, index + 1) + options.branch;
    }
    const data = await client.request({
      query: doc,
      variables: vars,
      url
    }, options);
    return { data: data?.data, errors: data?.errors, query: doc, variables: vars || {} };
  };
  return requester;
};
export const ExperimentalGetTinaClient = () => getSdk(
  generateRequester(
    createClient({
      url: "http://localhost:4001/graphql",
      queries
    })
  )
);
export const queries = (client) => {
  const requester = generateRequester(client);
  return getSdk(requester);
};
