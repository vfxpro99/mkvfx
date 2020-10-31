# mkvfx - Make vfx libraries and programs

This is a tool that builds open source libraries commonly used in
games, film, and vfx.

It is more like npm, and less like brew. It knows about dependencies, and
fetches what it needs. It builds as correctly and completely as it can, in
some cases by working around difficulties or inconsistencies in a library's
build system.

It runs installations in the directory in which it is run. For example, you
might make a staging directory, such as c:\projects, or ~/projects. Running
mkvfx in that directory will populate it according to the instructions in 
the various build recipes. Typically, you will end up with the following
directories, and miscellaneous others in the directory you run in:

```
include
bin
lib
```

Mkvfx will populate minimal local dependencies. If you are making a project 
that needs only OpenSubdiv, running

```sh
 mkvfx OpenSubdiv
```

in your project directory will give you the strict local dependencies to
have a working copy of OpenSubdiv, and nothing extraneous. This makes it
very easy to quarantine a project. If you also need OpenEXR in that same
project, subsequently running

```sh
 mkvfx OpenEXR
```

will add the bits that were not already there for OpenSubdiv.

At the moment there are many recipes for macOS and Windows.
The recipe system allows building on other platforms.


# mkvfx itself

clone this repo.


Now type ```mkvfx```, (or on windows: python mkvfx) to get full instructions.

You will see a message like -

```
 mkvfx knows how to build:
Alembic
assimp
autoconf
bgfx
boost
...
qt5
sqlite
stb
tbb


 mkvfx [options] [packages]
 --help           this message
 --install        install previously built package if possible
 --nofetch        skip fetching, default is fetch
 --nobuild        skip build, default is build
 --nodependencies skip dependencies
 -nfd             skip fetch and dependencies
 [packages]       to build, default is nothing


 Note that git repos are shallow cloned.
```


## macOS Runtime Environment

The OSX SDK contains some conflicting libraries, such as libpng. Traditionally,
one sets the DYLD_LIBRARY_PATH environment variable to point at your own runtime
environment. This will cause OSX system frameworks to fail though, because OSX
will prefer the mkvfx version of those libraries instead of the SDK versions, and
then frameworks like ImageIO won't load. It's best therefore to leave the
environment undisturbed, and instead contrive that your runtime has another way
to find the dynamic libraries.

mkvfx installs symlinks to the runtime libraries in the local bin folder so that
tools and utilities in the local bin can run properly without the need to modify
the global runtime environment. You can do the same, install your applications into
bin, or, you can install the necessary dylibs into your own build directory, or
you can invoke link magic to tell the loader where to look, or you can prefer
static versions of the libraries, if they can be built that way.

### License
Copyright (c) 2014-2018 Nick Porcino
Licensed under the MIT license.

