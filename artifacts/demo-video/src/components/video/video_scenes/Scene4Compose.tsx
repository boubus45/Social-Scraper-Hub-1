import { motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Scene4Compose() {
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowText(true), 800);
    return () => clearTimeout(t);
  }, []);

  const contentText = "Just discovered this insane 2x speedup for LoRA finetuning. The memory optimization tricks are next level. Anyone else trying this out?";

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-[#0D0D14]"
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <motion.div
        className="px-6 py-5 border-b border-[#2A2A35] flex items-center justify-between"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <h1 className="text-xl font-bold">Compose Post</h1>
        <X className="w-5 h-5 text-[#A0A0AB]" />
      </motion.div>

      {/* Editor */}
      <div className="flex-1 px-6 py-6 flex flex-col">
        <motion.div
          className="flex-1 bg-[#1A1A24] rounded-xl p-4 border border-[#2A2A35] mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <motion.div
            className="text-sm leading-relaxed text-white"
            initial={{ opacity: 0 }}
            animate={showText ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            {contentText}
          </motion.div>
        </motion.div>

        {/* AI Rephrase Button */}
        <motion.button
          className="w-full bg-gradient-to-r from-[#6C5CE7] to-[#8B7DE9] text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#6C5CE7]/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          whileHover={{ scale: 1.02 }}
        >
          <Sparkles className="w-5 h-5" />
          AI Rephrase
        </motion.button>
      </div>
    </motion.div>
  );
}