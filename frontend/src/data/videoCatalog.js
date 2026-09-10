// Add a video by copying this shape and pasting the YouTube video URL.
// The thumbnail is loaded directly from YouTube using the video ID.
export const VIDEOS = [
  {
    id: 'aws-cdk-crash-course',
    youtubeId: 'D4Asp5g4fp8',
    startSeconds: 2656,
    title: 'AWS CDK Crash Course for Beginners',
    channel: 'Be A Better Dev',
    description:
      'A practical introduction to defining, deploying, and iterating on AWS infrastructure with the Cloud Development Kit.',
    category: 'AWS & Cloud',
    tags: ['AWS', 'AWS CDK', 'Infrastructure as Code'],
  },
  {
    id: 'environment-specific-cdk-context',
    youtubeId: 'quSatWEVmMI',
    title: 'Simplify Environment-Specific Deployments with AWS CDK Context',
    channel: 'Cloudmancer',
    description:
      'A concise guide to using CDK context to configure and deploy infrastructure across multiple environments.',
    category: 'AWS & Cloud',
    tags: ['AWS', 'AWS CDK', 'Deployments'],
  },
  {
    id: 'is-rag-still-needed',
    youtubeId: 'UabBYexBD4k',
    startSeconds: 140,
    title: 'Is RAG Still Needed? Choosing the Best Approach for LLMs',
    channel: 'IBM Technology',
    description:
      'A comparison of retrieval-augmented generation with other approaches for grounding and improving LLM applications.',
    category: 'AI Systems',
    tags: ['AI', 'LLMs', 'RAG'],
  },
  {
    id: 'skills-mcp-rag-memory',
    youtubeId: 'X4FVEEegCbk',
    title: 'Skills vs MCP vs RAG vs Memory: What AI Agents Need to Know',
    channel: 'IBM Technology',
    description:
      'A clear breakdown of four complementary building blocks used to make AI agents more capable and context-aware.',
    category: 'AI Systems',
    tags: ['AI Agents', 'MCP', 'RAG', 'Memory'],
  },
  {
    id: 'what-is-rag',
    youtubeId: 'T-D1OfcDW1M',
    title: 'What is Retrieval-Augmented Generation (RAG)?',
    channel: 'IBM Technology',
    description:
      'An approachable explanation of how retrieval gives language models access to relevant, grounded information.',
    category: 'AI Systems',
    tags: ['AI', 'LLMs', 'RAG'],
  },
  {
    id: 'simple-made-easy',
    youtubeId: 'SxdOUGdseq4',
    title: 'Simple Made Easy',
    channel: 'InfoQ',
    description:
      'Rich Hickey explores the difference between simplicity and ease—and why that distinction matters when designing software.',
    category: 'Software Design',
    tags: ['Architecture', 'Complexity', 'Developer Craft'],
  },
  {
    id: 'inventing-on-principle',
    youtubeId: 'PUv66718DII',
    title: 'Inventing on Principle',
    channel: 'Bret Victor',
    description:
      'A memorable talk about building tools that make ideas visible and choosing a principle to guide creative work.',
    category: 'Creative Engineering',
    tags: ['Tools', 'Design', 'Learning'],
  },
  {
    id: 'future-of-programming',
    youtubeId: '8pTEmbeENF4',
    title: 'The Future of Programming',
    channel: 'Bret Victor',
    description:
      'A playful, thought-provoking look at how confidently we predict the future of computing.',
    category: 'Computing History',
    tags: ['Programming', 'History', 'Ideas'],
  },
];

export function getYouTubeUrl(videoId, startSeconds) {
  const startAt = startSeconds ? `&t=${startSeconds}s` : '';
  return `https://www.youtube.com/watch?v=${videoId}${startAt}`;
}

export function getYouTubeThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
