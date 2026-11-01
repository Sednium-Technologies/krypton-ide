import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check } from 'lucide-react';
import { useSkillsStore, Skill } from '../../store/useSkillsStore';

interface SlashCommandPickerProps {
  query: string; // text after '/'
  onSelectSkill: (skill: Skill) => void;
  onClose: () => void;
}

export function SlashCommandPicker({ query, onSelectSkill, onClose }: SlashCommandPickerProps) {
  const { skills, loadSkills } = useSkillsStore();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const filteredSkills = skills.filter((s) => {
    if (!s.enabled) return false;
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredSkills.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredSkills.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredSkills[selectedIndex]) {
          onSelectSkill(filteredSkills[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredSkills, selectedIndex, onSelectSkill, onClose]);

  if (filteredSkills.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        style={{ willChange: 'transform, opacity' }}
        className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto bg-[#252227]/95 backdrop-blur-2xl border border-[#f3f0e7]/20 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] p-1.5 z-50 text-[#f3f0e7] scrollbar-hide"
      >
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-300 flex items-center space-x-1.5 border-b border-[#f3f0e7]/10 mb-1">
          <Sparkles size={12} className="text-teal-400" />
          <span>Agent Skills (/ command)</span>
        </div>

        {filteredSkills.map((skill, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <div
              key={skill.id}
              onClick={() => onSelectSkill(skill)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-start space-x-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                isSelected ? 'bg-teal-500/20 border border-teal-500/40 text-teal-100' : 'hover:bg-[#f3f0e7]/10 text-[#f3f0e7]/80'
              }`}
            >
              <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-300 flex-shrink-0 mt-0.5">
                <Sparkles size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#f3f0e7] truncate">/{skill.name}</span>
                  {skill.isBuiltIn && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f3f0e7]/10 text-[#f3f0e7]/60 font-semibold">
                      Built-in
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#f3f0e7]/60 line-clamp-1 mt-0.5">
                  {skill.description}
                </p>
              </div>
              {isSelected && <Check size={14} className="text-teal-400 flex-shrink-0 mt-1" />}
            </div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
