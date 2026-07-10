"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { avatarUrl, saveProfile, type Profile } from "@/lib/user";

export function ProfileDialog({
    wallet,
    open,
    onOpenChange,
    initial,
    required = false,
}: {
    wallet: string;
    open: boolean;
    onOpenChange: (o: boolean) => void;
    initial?: Profile | null;
    required?: boolean;
}) {
    const qc = useQueryClient();
    const [username, setUsername] = useState("");
    const [bio, setBio] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setUsername(initial?.username ?? "");
            setBio(initial?.bio ?? "");
            setError(null);
        }
    }, [open, initial]);

    const preview = avatarUrl(wallet);

    const mutation = useMutation({
        mutationFn: () =>
            saveProfile({
                wallet,
                username: username.trim(),
                bio: bio.trim(),
                avatar: avatarUrl(wallet),
            }),
        onSuccess: (p) => {
            qc.setQueryData(["profile", wallet], p);
            onOpenChange(false);
        },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!(required && !o)) onOpenChange(o); }}>
            <DialogContent
                className="sm:max-w-md"
                showCloseButton={!required}
                onEscapeKeyDown={(e) => required && e.preventDefault()}
                onInteractOutside={(e) => required && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Complete your profile</DialogTitle>
                    <DialogDescription>
                        {required
                            ? "Choose a username to continue. This is required."
                            : "Pick a username and an optional bio."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-5 py-2">

                    <div className="flex justify-center">

                        <img
                            src={preview}
                            alt="avatar"
                            className="size-20 rounded-full bg-muted ring-1 ring-border"
                        />
                    </div>

                    <label className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            Username
                        </span>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value.slice(0, 32))}
                            placeholder="satoshi"
                            autoFocus
                            className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            Bio <span className="normal-case">(optional)</span>
                        </span>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value.slice(0, 160))}
                            placeholder="A short line about you"
                            rows={3}
                            className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        />
                    </label>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button
                        size="lg"
                        className="w-full"
                        disabled={!username.trim() || mutation.isPending}
                        onClick={() => mutation.mutate()}
                    >
                        {mutation.isPending ? "Saving…" : "Save profile"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
