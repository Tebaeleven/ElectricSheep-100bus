"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useVibration } from "@/lib/hooks/use-vibration";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,box-shadow,opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 card-button",
        destructive:
          "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90 card-button",
        outline:
          "border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))]",
        secondary:
          "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90 card-button",
        ghost: "hover:bg-[hsl(var(--accent))]",
        link: "text-[hsl(var(--primary))] underline-offset-4 hover:underline",
        care: "bg-[#e56b8c] text-white hover:bg-[#d45a7c] shadow-md card-button",
        careSoft:
          "border-2 border-[#302c55]/25 bg-white text-[#302c55] hover:bg-[#f7f8fb] card-button",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
        care: "min-h-[4.5rem] w-full rounded-2xl px-5 py-4 text-xl font-semibold tracking-wide sm:min-h-[3.5rem] sm:text-lg",
        careQuick:
          "min-h-[3.75rem] flex-1 rounded-2xl px-3 py-3 text-lg font-semibold sm:min-h-[3rem] sm:text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const { vibrate } = useVibration();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      vibrate(10);
      onClick?.(e);
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
