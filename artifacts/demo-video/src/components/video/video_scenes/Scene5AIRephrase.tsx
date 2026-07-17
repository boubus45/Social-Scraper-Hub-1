import { motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Scene5AIRephrase() {
  const [thinking, setThinking] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setThinking(false), 2000);
    const t2 = setTimeout(() => setShowNew(true), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const oldText = "Just discovered this insane 2x speedup for LoRA finetuning. The memory optimization tricks are next level. Anyone else trying this out?";
  const newText = "Excited to share: we're seeing 2x faster LoRA finetuning with these memory optimization techniques. Early results are very promising. Would love to hear from others experimenting with this approach.";

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-[#0D0D14]"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <motion.div
        className="px-6 py-5 border-b border-[#2A2A35] flex items-center justify-between"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
      >
        <h1 className="text-xl font-bold">Compose Post</h1>
        <X className="w-5 h-5 text-[#A0A0AB]" />
      </motion.div>

      {/* Editor */}
      <div className="flex-1 px-6 py-6 flex flex-col">
        <motion.div
          className="flex-1 bg-[#1A1A24] rounded-xl p-4 border-2 border-[#6C5CE7] mb-4 relative overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
        >
          {thinking && (
            <motion.div
              className="absolute inset-0 bg-[#1A1A24] flex items-center justify-center z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[#6C5CE7] animate-spin" />
                <span className="text-sm text-[#A0A0AB]">AI thinking...</span>
              </div>
            </motion.div>
          )}

          <motion.div
            className="text-sm leading-relaxed text-[#5A5A65] line-through"
            animate={{ opacity: showNew ? 0.3 : 1 }}
            transition={{ duration: 0.4 }}
          >
            {oldText}
          </motion.div>

          {showNew && (
            <motion.div
              className="text-sm leading-relaxed text-white mt-4 pt-4 border-t border-[#2A2A35]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {newText}
            </motion.div>
          )}
        </motion.div>

        {/* Platform Selector */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: showNew ? 1 : 0, y: showNew ? 0 : 10 }}
          transition={{ delay: showNew ? 0.5 : 0, duration: 0.4 }}
        >
          <div className="text-xs text-[#A0A0AB] mb-2 px-1">Post to</div>
          <div className="flex gap-2">
            <div className="px-4 py-2 rounded-lg bg-[#FF4500] text-white text-sm font-medium flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                r/
              </div>
              Reddit
            </div>
            <div className="px-4 py-2 rounded-lg border border-[#2A2A35] text-[#A0A0AB] text-sm font-medium">
              Twitter
            </div>
          </div>
        </motion.div>

        {/* Preview Button */}
        <motion.button
          className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8B7DE9] text-white font-semibold py-4 rounded-xl shadow-lg shadow-[#6C5CE7]/20"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: showNew ? 1 : 0, y: showNew ? 0 : 10 }}
          transition={{ delay: showNew ? 0.7 : 0, duration: 0.4 }}
        >
          Preview & Post
        </motion.button>
      </div>
    </motion.div>
  );
}