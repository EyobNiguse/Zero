import { Button } from "@/components/ui/button";
import { FileIcon } from "lucide-react";
import { X } from "lucide-react";
import Image from "next/image";
import React from "react";

const getLogo = (mimetype: string): string => {
  if (mimetype.includes("pdf")) {
    return "/assets/attachment-icons/pdf.svg";
  } else if (mimetype.includes("wordprocessingml") || mimetype.includes("msword")) {
    return "/assets/attachment-icons/word.svg";
  } else if (mimetype.includes("presentationml") || mimetype.includes("powerpoint")) {
    return "/assets/attachment-icons/powerpoint.svg";
  }

  return "";
};

type Props = {
  removeAttachment: (index: number) => void;
  index: number;
  file: File;
};

export const UploadedFileIcon = ({ removeAttachment, index, file }: Props) => {
  return (
    <div className="relative h-24 w-full">
      {file.type.startsWith("image/") ? (
        <>
          <Image src={URL.createObjectURL(file)} alt={file.name} fill className="object-cover" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 bg-black/20 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/30 group-hover:opacity-100"
            onClick={() => removeAttachment(index)}
          >
            <X className="h-3 w-3 text-white" />
          </Button>
        </>
      ) : (
        <div className="bg-muted/20 flex h-full w-full items-center justify-center">
          {getLogo(file.type) ? (
            <Image src={getLogo(file.type)} alt={file.name} width={48} height={48} />
          ) : (
            <FileIcon className="text-primary h-8 w-8" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => removeAttachment(index)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
};
