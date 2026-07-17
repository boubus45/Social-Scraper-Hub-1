import { motion } from 'framer-motion';
import { ChevronDown, Settings, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Scene2Settings() {
  const [showFirst, setShowFirst] = useState(false);
  const [showSecond, setShowSecond] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowFirst(true), 1500);
    const t2 = setTimeout(() => setShowSecond(true), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-[#0D0D14]"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div
        className="px-6 py-5 border-b border-[#2A2A35] flex items-center gap-3"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <Settings className="w-5 h-5 text-[#6C5CE7]" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Reddit Section */}
        <motion.div
          className="bg-[#1A1A24] rounded-2xl p-5 border border-[#2A2A35]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FF4500] flex items-center justify-center text-sm font-bold">
                r/
              </div>
              <span className="font-semibold text-lg">Reddit</span>
            </div>
            <ChevronDown className="w-5 h-5 text-[#A0A0AB]" />
          </div>

          <div className="space-y-3">
            <div className="text-sm text-[#A0A0AB] mb-2">Subreddits</div>
            
            <div className="flex flex-wrap gap-2">
              {/* First Tag */}
              <motion.div
                className="px-3 py-1.5 rounded-full bg-[#6C5CE7] text-white text-sm font-medium flex items-center gap-2"
                initial={{ scale: 0, opacity: 0 }}
                animate={showFirst ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                unsloth
              </motion.div>

              {/* Second Tag */}
              <motion.div
                className="px-3 py-1.5 rounded-full bg-[#6C5CE7] text-white text-sm font-medium flex items-center gap-2"
                initial={{ scale: 0, opacity: 0 }}
                animate={showSecond ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                hermesagent
              </motion.div>

              {/* Add Button */}
              <motion.button
                className="px-3 py-1.5 rounded-full border border-[#2A2A35] text-[#A0A0AB] text-sm font-medium flex items-center gap-1.5 hover:border-[#6C5CE7] transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 4, duration: 0.4 }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}