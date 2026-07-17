import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

export function Scene1FeedEmpty() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-[#0D0D14]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <motion.div
        className="px-6 py-5 border-b border-[#2A2A35]"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold">Feed</h1>
      </motion.div>

      {/* Empty State */}
      <div className="flex-1 flex items-center justify-center px-8">
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6, type: 'spring', stiffness: 200 }}
        >
          <motion.div
            animate={{ rotate: [0, 180, 360] }}
            transition={{ delay: 2, duration: 2, ease: "easeInOut" }}
          >
            <RefreshCw className="w-16 h-16 text-[#6C5CE7] mb-4" strokeWidth={1.5} />
          </motion.div>
          
          <motion.h2
            className="text-xl font-semibold mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.4 }}
          >
            No posts yet
          </motion.h2>
          
          <motion.p
            className="text-[#A0A0AB] text-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.4 }}
          >
            Add sources in settings to start
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  );
}