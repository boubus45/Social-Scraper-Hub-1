import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export function Scene6Success() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#0D0D14]"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Confetti Burst Effect */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{
            background: i % 3 === 0 ? '#6C5CE7' : i % 3 === 1 ? '#8B7DE9' : '#A99BEB',
          }}
          initial={{ 
            x: 0, 
            y: 0, 
            scale: 0,
            opacity: 1 
          }}
          animate={{ 
            x: Math.cos((i / 12) * Math.PI * 2) * 120,
            y: Math.sin((i / 12) * Math.PI * 2) * 120,
            scale: [0, 1, 0],
            opacity: [1, 1, 0]
          }}
          transition={{ 
            delay: 0.3,
            duration: 1.2,
            ease: "easeOut"
          }}
        />
      ))}

      {/* Success Icon */}
      <motion.div
        className="flex flex-col items-center"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          delay: 0.2,
          duration: 0.6,
          type: 'spring',
          stiffness: 200,
          damping: 15
        }}
      >
        <CheckCircle2 
          className="w-24 h-24 text-[#6C5CE7] mb-4" 
          strokeWidth={1.5}
        />
        
        <motion.h2
          className="text-2xl font-bold mb-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          Posted Successfully!
        </motion.h2>
        
        <motion.p
          className="text-[#A0A0AB] text-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          Your content is now live
        </motion.p>
      </motion.div>
    </motion.div>
  );
}