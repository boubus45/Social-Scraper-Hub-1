import { motion } from 'framer-motion';
import { Loader2, ArrowBigUp, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

const posts = [
  { id: 1, subreddit: 'unsloth', title: 'New 2x faster finetuning with LoRA adapters', author: 'u/unsloth_ai', upvotes: 142, comments: 23 },
  { id: 2, subreddit: 'hermesagent', title: 'Agent orchestration patterns that actually work', author: 'u/agent_dev', upvotes: 89, comments: 15 },
  { id: 3, subreddit: 'unsloth', title: 'Memory optimization tricks for LLaMA training', author: 'u/ml_engineer', upvotes: 201, comments: 34 },
  { id: 4, subreddit: 'hermesagent', title: 'Building reliable multi-agent workflows', author: 'u/hermes_team', upvotes: 156, comments: 28 },
];

export function Scene3FeedLoaded() {
  const [loading, setLoading] = useState(true);
  const [showPosts, setShowPosts] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLoading(false), 1500);
    const t2 = setTimeout(() => setShowPosts(true), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-[#0D0D14]"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div
        className="px-6 py-5 border-b border-[#2A2A35]"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold">Feed</h1>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <motion.div
            className="flex items-center justify-center py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Loader2 className="w-8 h-8 text-[#6C5CE7] animate-spin" />
          </motion.div>
        )}

        {showPosts && (
          <div className="px-4 py-4 space-y-3">
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                className="bg-[#1A1A24] rounded-xl p-4 border border-[#2A2A35] cursor-pointer hover:border-[#6C5CE7] transition-colors"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  delay: i * 0.15,
                  duration: 0.5,
                  type: 'spring',
                  stiffness: 200,
                  damping: 20
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <ArrowBigUp className="w-5 h-5 text-[#A0A0AB]" />
                    <span className="text-xs font-mono text-[#A0A0AB]">{post.upvotes}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[#6C5CE7] font-medium mb-1">
                      r/{post.subreddit}
                    </div>
                    <h3 className="font-semibold text-sm leading-snug mb-2">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-[#A0A0AB]">
                      <span>{post.author}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {post.comments}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}