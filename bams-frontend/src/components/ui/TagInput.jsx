import React, { useState } from 'react';
import { Badge } from "@radix-ui/themes";
import { X } from "lucide-react";
import { isValidEmail } from '../../lib/helper';

const TagInput = ({ 
  tags = [], 
  onTagsChange, 
  placeholder = "Type and press Enter...", 
  className = "",
  validator,
  error,
  setError,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isError, setIsError] = useState(false);
  
  const handleKeyDown = (e) => {
   
    if (e.key === 'Enter') {
      e.preventDefault();
      const newTag = inputValue.trim();
     
      if (!newTag) return;

      // Check if validation is provided and fails
      if (validator && !validator(newTag)) {
        setIsError(true);
        if (setError) setError("Please enter a valid email address");
        return; // Stop and don't add the tag
      }

      // Add the tag if it's not empty and doesn't already exist
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
     
      setInputValue("");
      setIsError(false); // Reset error on success
      if (setError) setError("");
   
    } else if (e.key === 'Backspace' && inputValue === "" && tags.length > 0) {
      
      // Remove the last tag if backspace is pressed on an empty input
      onTagsChange(tags.slice(0, -1));
      setIsError(false);
      if (setError) setError("");
    } else {
      // Clear error when user types again
      setIsError(false);
      if (setError) setError("");
    }
  };

  const removeTag = (tagToRemove) => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div 
      className={`flex flex-wrap items-center gap-2 p-2 min-h-10 bg-white border rounded-md shadow-sm transition-all cursor-text ${
        isError 
          ? "border-red-500 focus-within:ring-1 focus-within:ring-red-500" 
          : "border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
      } ${className}`}
      onClick={(e) => {
        // Focus the input when clicking anywhere inside the container
        const input = e.currentTarget.querySelector('input');
        if (input) input.focus();
      }}
    >
      {tags?.map((tag, index) => (
        <Badge 
          key={index} 
          color="blue" 
          variant="soft" 
          radius="medium"
          className="flex items-center gap-1 px-2 py-1 text-sm font-medium"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            className="flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-600 outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer p-0.5 ml-1 transition-colors"
          >
            <X size={14} />
          </button>
        </Badge>
      ))}
      <input
        id="email-input"
        type="email"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsError(false); // Clear error on typing
          if (setError) setError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className={`flex-1 min-w-30 outline-none bg-transparent text-sm placeholder-gray-400 ${
          isError ? "text-red-600" : "text-gray-800"
        }`}
      />
    </div>
  );
};

export default TagInput;
