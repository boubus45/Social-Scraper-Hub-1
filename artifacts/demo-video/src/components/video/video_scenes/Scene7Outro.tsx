import { motion } from 'framer-motion';

export function Scene7Outro() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#0D0D14] z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="text-center px-12">
        {/* Logo/Wordmark */}
        <motion.h1
          className="text-6xl font-black mb-6 bg-gradient-to-r from-[#6C5CE7] to-[#A99BEB] bg-clip-text text-transparent"
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ 
            delay: 0.3,
            duration: 0.8,
            type: 'spring',
            stiffness: 150,
            damping: 20
          }}
        >
          SocialScraper
        </motion.h1>

        {/* Tagline */}
        <motion.p
          className="text-xl text-[#A0A0AB] font-medium tracking-wide"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          Fetch. Rephrase. Post.
        </motion.p>

        {/* Decorative Line */}
        <motion.div
          className="mt-8 mx-auto h-1 bg-gradient-to-r from-transparent via-[#6C5CE7] to-transparent"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '100%', opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          style={{ maxWidth: '200px' }}
        />
      </div>
    </motion.div>
  );
}