# mkvfx - Make vfx libraries and programs

This is a tool that builds open source libraries commonly used in
games, film, and vfx.

It is more like npm, and less like brew. It knows about dependencies, and
fetches what it needs. It builds as correctly and completely as it can, in
some cases by working around difficulties or inconsistencies in a library's
build system.

It expects to run in a directory in which there will be a directory called
local. If local doesn't exist, it will make one. If you run in /usr, it
will populate /usr/local/lib, /usr/local/include, /usr/local/bin, and so on.

The more interesting thing it will do is populate minimal local dependencies.
If you are making a project that needs only OpenSubdiv, running

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

At the moment there are many recipes for OSX, and several Windows.
The recipe system allows building on other platforms. Pull requests are
welcome of course.

It would be nice if the script also knows about configurations. At the
moment, it pulls top of tree of a specific branch (by default master), but
a little sugar in the recipes file for configurations could allow for
doing a build that conforms to something specific such as vfxplatform.com's
"Current - VFX Platform CY2015".

## Runtime

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

## Installation

# Prerequisites

On OSX, mkvfx expects to run in a bash or zsh environment.

On Windows, mkvfx expects to run in a Visual Studio command prompt.

On Windows, make sure that python can be invoked from the
Visual Studio command prompt. The Python installer doesn't modify the PATH
variable, so do that in the environment settings panel.


# mkvfx itself

clone this repo. Install the dependencies using npm.


on Windows, if using VS2015 use this instead:


Now type mkvfx, and all will be revealed.

On OSX you will see a message like -

```
 mkvfx knows how to build:
Alembic
assimp
autoconf
bgfx
boost
boost-build-club
bullet
bx
c-blosc
glew
glfw
glm
hdf5
IlmBase
jsoncpp
LabText
libjpeg
libpng
libtiff
llvm
nanovg
OpenColorIO
OpenEXR
OpenImageIO
OpenShadingLanguage-WIP
OpenSubdiv
OpenVDB
partio
ptex
PyIlmBase
python
qt
qt4
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






### License
Copyright (c) 2014 Nick Porcino
Licensed under the MIT license.
